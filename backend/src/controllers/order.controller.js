/**
 * order.controller.js  (customer side)
 *
 *   POST /orders/quote            price a cart (items + optional coupon), no side effects
 *   POST /orders/checkout         place the order
 *                                   cod      -> order is created, waits for the shop to confirm
 *                                   razorpay -> order is created unpaid, stock held, gateway order returned
 *   POST /orders/verify-payment   browser reports a finished payment -> order paid + confirmed
 *   POST /orders/razorpay-webhook Razorpay confirms the same thing server to server
 *   GET  /orders/my, /orders/my/:id, PATCH /orders/my/:id/cancel
 */

import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import Coupon from "../models/coupon.model.js";
import { checkPincode } from "../utils/serviceability.js";
import Cart from "../models/cart.model.js";
import PaymentTransaction from "../models/paymentTransaction.model.js";
import {
  computeTotals,
  evaluateCoupon,
  getCommerceSettings,
  paymentOptions,
  unitPrice,
} from "../utils/orderPricing.js";
import { releaseStock, reserveStock } from "../utils/stock.js";
import {
  createGatewayOrder,
  gatewayPublicKey,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from "../utils/razorpayGateway.js";
import { applyPayment, closeOrder } from "../services/orderService.js";
import { sendOrderConfirmation } from "../services/orderEmail.js";

const PAYMENT_WINDOW_MINUTES = Number(process.env.ORDER_PAYMENT_WINDOW_MINUTES) || 30;
const MAX_LINES = 50;
const MAX_QTY = 100;

const fail = (status, message) => Object.assign(new Error(message), { status });
const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v));

const sendError = (res, err) => {
  if (err.status) return res.status(err.status).json({ success: false, message: err.message });
  if (err.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: Object.values(err.errors).map((e) => e.message).join(" "),
    });
  }
  console.error("order error:", err);
  return res.status(500).json({ success: false, message: "Server error." });
};

// ─── Cart lines ───────────────────────────────────────────────────────────

/**
 * Turns [{productId, variantId?, quantity}] into priced order lines, checking
 * that the products exist, options are chosen and enough stock is left.
 * Prices always come from the database, never from the request.
 */
async function resolveLines(items) {
  if (!Array.isArray(items) || items.length === 0) throw fail(400, "Your cart is empty.");
  if (items.length > MAX_LINES) throw fail(400, "Too many items in the cart.");

  // Merge repeated product + option lines
  const wanted = new Map();
  for (const raw of items) {
    const productId = raw?.productId;
    const variantId = raw?.variantId || null;
    const quantity = Number(raw?.quantity);
    if (!isObjectId(productId) || (variantId && !isObjectId(variantId)))
      throw fail(400, "A cart item is not valid.");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY)
      throw fail(400, `Quantity must be a whole number from 1 to ${MAX_QTY}.`);
    const key = `${productId}:${variantId ?? ""}`;
    const prev = wanted.get(key);
    wanted.set(key, { productId, variantId, quantity: (prev?.quantity ?? 0) + quantity });
  }

  const products = await Product.find({
    _id: { $in: [...new Set([...wanted.values()].map((w) => w.productId))] },
    isActive: true,
  });
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const lines = [];
  for (const { productId, variantId, quantity } of wanted.values()) {
    const product = byId.get(String(productId));
    if (!product) throw fail(400, "A product in your cart is no longer available.");

    let variant = null;
    if (product.variants.length) {
      if (!variantId) throw fail(400, `Please choose an option for "${product.name}".`);
      variant = product.variants.id(variantId);
      if (!variant) throw fail(400, `The option you chose for "${product.name}" is no longer available.`);
    } else if (variantId) {
      throw fail(400, `"${product.name}" has no options.`);
    }

    const available = variant ? variant.stock : product.stock;
    const label = variant ? `${product.name} (${variant.name})` : product.name;
    if (available <= 0) throw fail(409, `"${label}" is out of stock.`);
    if (quantity > available) throw fail(409, `Only ${available} of "${label}" left.`);

    const price = unitPrice(product, variant);
    lines.push({
      product: product._id,
      variantId: variant?._id ?? null,
      name: product.name,
      variantName: variant?.name,
      sku: variant?.sku ?? product.sku,
      image: product.thumbnail?.url || product.gallery?.[0]?.url || "",
      attributes: variant?.attributes ? Object.fromEntries(variant.attributes) : undefined,
      price,
      quantity,
      lineTotal: Math.round(price * quantity * 100) / 100,
    });
  }
  return lines;
}

const subtotalOf = (lines) => Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;

// ─── Address ──────────────────────────────────────────────────────────────

function cleanAddress(raw) {
  const text = (v) => (v == null ? "" : String(v).trim());
  const address = {
    fullName: text(raw?.fullName),
    phone: text(raw?.phone).replace(/[\s\-().+]/g, ""),
    line1: text(raw?.line1),
    line2: text(raw?.line2) || undefined,
    landmark: text(raw?.landmark) || undefined,
    city: text(raw?.city),
    state: text(raw?.state),
    country: text(raw?.country) || "India",
    pincode: text(raw?.pincode),
  };
  if (address.fullName.length < 2) throw fail(400, "Please enter the name for delivery.");
  if (!/^[0-9]{10,15}$/.test(address.phone)) throw fail(400, "Please enter a valid phone number (10 to 15 digits).");
  if (!address.line1) throw fail(400, "Please enter the delivery address.");
  if (!address.city || !address.state) throw fail(400, "Please enter the city and state.");
  if (!/^[0-9]{6}$/.test(address.pincode)) throw fail(400, "Please enter a valid 6-digit PIN code.");
  return address;
}

function resolveAddress(req) {
  const { addressId, shippingAddress } = req.body;
  if (addressId) {
    const saved = req.customer.addresses.id(addressId);
    if (!saved) throw fail(400, "That saved address was not found.");
    return cleanAddress(saved);
  }
  if (!shippingAddress) throw fail(400, "A delivery address is required.");
  return cleanAddress(shippingAddress);
}

// ─── Quote ────────────────────────────────────────────────────────────────

export const quoteOrder = async (req, res) => {
  try {
    const lines = await resolveLines(req.body.items);
    const settings = await getCommerceSettings();
    const subtotal = subtotalOf(lines);

    let discount = 0;
    let freeShipping = false;
    let couponCode;
    let couponError;
    if (req.body.couponCode) {
      try {
        const result = await evaluateCoupon(req.body.couponCode, subtotal, req.customer?._id, lines);
        discount = result.discount;
        freeShipping = result.freeShipping;
        couponCode = result.coupon.code;
      } catch (err) {
        if (!err.status) throw err;
        couponError = err.message; // not fatal: show the totals without the coupon
      }
    }

    // Totals depend on how the customer pays (cash on delivery can carry a fee)
    const paymentMethod = req.body.paymentMethod === "cod" ? "cod" : "razorpay";
    const { giftWrapCharge } = readGift(req.body.gift, settings);
    const base = computeTotals({ subtotal, discount, settings, freeShipping, giftWrapCharge });
    // Optional PIN code: tells the cart page whether it is deliverable and whether COD works
    const delivery = req.body.pincode ? await checkPincode(req.body.pincode) : undefined;

    return res.status(200).json({
      success: true,
      data: {
        lines: lines.map(({ name, variantName, image, price, quantity, lineTotal }) => ({
          name, variantName, image, price, quantity, lineTotal,
        })),
        ...computeTotals({ subtotal, discount, settings, paymentMethod, freeShipping, giftWrapCharge }),
        paymentMethod,
        paymentOptions: paymentOptions(settings, base.totalAmount).map((opt) =>
          opt.method === "cod" && delivery?.valid && (!delivery.serviceable || !delivery.codAvailable)
            ? { ...opt, enabled: false, reason: delivery.message || "Cash on delivery is not available for this PIN code." }
            : opt,
        ),
        giftWrapOptions: settings.giftWrapOptions,
        delivery,
        couponCode,
        couponError,
      },
    });
  } catch (err) {
    return sendError(res, err);
  }
};

// ─── Payment details of an existing online order ──────────────────────────

/** What the browser needs to (re)open the payment window, or null if it cannot be paid any more. */
async function paymentPayload(order) {
  const payable =
    order.paymentMethod === "razorpay" &&
    order.status === "pending" &&
    order.paymentStatus === "unpaid" &&
    order.razorpayOrderId &&
    order.paymentExpiresAt > new Date();
  if (!payable) return null;

  const tx = await PaymentTransaction.findOne({
    order: order._id,
    razorpayOrderId: order.razorpayOrderId,
    status: "created",
  }).lean();
  if (!tx?.requestPayload?.amount) return null;
  return {
    key: gatewayPublicKey(),
    razorpayOrderId: order.razorpayOrderId,
    amount: tx.requestPayload.amount,
    currency: tx.requestPayload.currency || "INR",
    expiresAt: order.paymentExpiresAt,
  };
}

/** The answer for a checkout that has already created its order (a repeated request). */
async function replayCheckout(res, order) {
  const data = {
    orderId: order._id,
    orderNo: order.orderNo,
    totalAmount: order.totalAmount,
    paymentMethod: order.paymentMethod,
  };
  if (order.paymentMethod === "cod")
    return res.status(201).json({ success: true, message: "Order placed.", data });

  const payment = await paymentPayload(order);
  if (!payment) throw fail(409, "This order was already placed. You can find it in My account.");
  return res.status(201).json({ success: true, message: "Order placed. Complete the payment to confirm it.", data: { ...data, payment } });
}

/** POST /orders/my/:orderId/pay  opens the payment again for an unpaid online order */
export const payMyOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = isObjectId(orderId) ? await Order.findOne({ _id: orderId, customer: req.customer._id }) : null;
    if (!order) throw fail(404, "Order not found.");
    const payment = await paymentPayload(order);
    if (!payment) throw fail(400, "This order can not be paid any more. Please place a new order.");
    return res.status(200).json({
      success: true,
      data: { orderId: order._id, orderNo: order.orderNo, totalAmount: order.totalAmount, paymentMethod: order.paymentMethod, payment },
    });
  } catch (err) {
    return sendError(res, err);
  }
};

// ─── Checkout ─────────────────────────────────────────────────────────────

/**
 * Gift options from the checkout form:
 *   { isGift, message, wrap, wrapOption, recipientName, fromName, hidePrice }
 * "wrapOption" is the id or name of one of the shop's gift wrap choices (App Configuration).
 * Returns { gift, giftWrapCharge }. The price always comes from the shop's settings.
 */
function readGift(raw, settings) {
  if (!raw || typeof raw !== "object" || raw.isGift !== true) return { gift: { isGift: false }, giftWrapCharge: 0 };
  const text = (v, max, label) => {
    if (v === undefined || v === null || v === "") return undefined;
    if (typeof v !== "string") throw fail(400, `The gift ${label} is not valid.`);
    const t = v.trim();
    if (t.length > max) throw fail(400, `The gift ${label} is too long (${max} characters at most).`);
    return t || undefined;
  };
  const message = text(raw.message, 250, "message");
  const recipientName = text(raw.recipientName, 100, "recipient name");
  const fromName = text(raw.fromName, 100, "sender name");

  let wrap = raw.wrap === true || !!raw.wrapOption;
  let wrapName;
  let giftWrapCharge = 0;
  const options = settings?.giftWrapOptions || [];
  if (wrap && options.length) {
    const wanted = String(raw.wrapOption ?? "").trim();
    const choice = wanted ? options.find((o) => o.id === wanted || o.name.toLowerCase() === wanted.toLowerCase()) : options[0];
    if (!choice) throw fail(400, "That gift wrap option is not available.");
    wrapName = choice.name;
    giftWrapCharge = choice.price;
  } else if (raw.wrapOption && !options.length) {
    throw fail(400, "Gift wrapping is not available right now.");
  }
  return {
    gift: { isGift: true, message, wrap, wrapName, recipientName, fromName, hidePrice: raw.hidePrice !== false },
    giftWrapCharge,
  };
}

export const checkout = async (req, res) => {
  let reservedLines = null;
  let couponTaken = null;

  try {
    const { paymentMethod, couponCode, customerNote, saveAddress } = req.body;
    if (!["razorpay", "cod"].includes(paymentMethod))
      throw fail(400, 'paymentMethod must be "razorpay" or "cod".');
    if (customerNote && String(customerNote).length > 500) throw fail(400, "The note is too long (500 characters at most).");
    const idempotencyKey =
      typeof req.body.idempotencyKey === "string" && req.body.idempotencyKey.trim()
        ? req.body.idempotencyKey.trim().slice(0, 64)
        : undefined;
    // The same attempt sent twice (double click, network retry) gets the same order back
    if (idempotencyKey) {
      const previous = await Order.findOne({ customer: req.customer._id, idempotencyKey });
      if (previous) return await replayCheckout(res, previous);
    }

    const lines = await resolveLines(req.body.items);
    const address = resolveAddress(req);
    const settings = await getCommerceSettings();
    const subtotal = subtotalOf(lines);
    const { gift, giftWrapCharge } = readGift(req.body.gift, settings);

    // Do we deliver there, and is cash on delivery allowed?
    const delivery = await checkPincode(address.pincode);
    if (!delivery.serviceable) throw fail(400, delivery.message || "Sorry, we do not deliver to this PIN code.");
    if (paymentMethod === "cod" && !delivery.codAvailable) throw fail(400, "Cash on delivery is not available for this PIN code. Please pay online.");

    // An online order for this very cart is still waiting for payment (the payment
    // window was closed): carry on with it rather than creating a second one.
    if (paymentMethod === "razorpay") {
      const signature = (items) => items.map((i) => `${i.product}:${i.variantId ?? ""}:${i.quantity}`).sort().join("|");
      const code = couponCode ? String(couponCode).trim().toUpperCase() : "";
      const waiting = await Order.find({
        customer: req.customer._id,
        paymentMethod: "razorpay",
        status: "pending",
        paymentStatus: "unpaid",
        paymentExpiresAt: { $gt: new Date() },
        razorpayOrderId: { $exists: true },
        subtotal,
      }).limit(5);
      const same = waiting.find((o) => signature(o.items) === signature(lines) && (o.couponCode || "") === code && (o.giftWrapCharge || 0) === giftWrapCharge);
      if (same && (await paymentPayload(same))) {
        same.shippingAddress = address;
        same.customerNote = customerNote?.trim() || undefined;
        same.gift = gift;
        await same.save();
        return await replayCheckout(res, same);
      }
    }

    // Coupon: validate, then take one use atomically (respecting the usage limit)
    let discount = 0;
    let freeShipping = false;
    let appliedCode;
    if (couponCode) {
      const { coupon, discount: d, freeShipping: fs_ } = await evaluateCoupon(couponCode, subtotal, req.customer._id, lines);
      freeShipping = fs_;
      const taken = await Coupon.updateOne(
        {
          _id: coupon._id,
          $or: [{ usageLimit: null }, { $expr: { $lt: ["$usedCount", "$usageLimit"] } }],
        },
        { $inc: { usedCount: 1 } },
      );
      if (taken.modifiedCount !== 1) throw fail(400, "This coupon has reached its usage limit.");
      couponTaken = coupon._id;
      discount = d;
      appliedCode = coupon.code;
    }

    const withoutCodFee = computeTotals({ subtotal, discount, settings, freeShipping, giftWrapCharge }).totalAmount;
    const option = paymentOptions(settings, withoutCodFee).find((o) => o.method === paymentMethod);
    if (!option.enabled) throw fail(400, option.reason || "That payment method is not available.");
    const totals = computeTotals({ subtotal, discount, settings, paymentMethod, freeShipping, giftWrapCharge });

    // Hold the stock (all or nothing)
    const reserved = await reserveStock(lines);
    if (!reserved.ok) {
      const p = await Product.findById(reserved.item.product).select("name");
      throw fail(409, `"${p?.name ?? "An item"}" just went out of stock. Please update your cart.`);
    }
    reservedLines = lines;

    const online = paymentMethod === "razorpay";
    const order = await Order.create({
      customer: req.customer._id,
      customerName: req.customer.name,
      customerEmail: req.customer.email,
      customerPhone: req.customer.phone || address.phone,
      items: lines,
      ...totals,
      couponCode: appliedCode,
      shippingAddress: address,
      paymentMethod,
      paymentStatus: "unpaid",
      status: "pending",
      stockReserved: true,
      paymentExpiresAt: online ? new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60 * 1000) : undefined,
      customerNote: customerNote?.trim() || undefined,
      gift,
      idempotencyKey,
    });
    reservedLines = null; // from here the order owns the stock reservation
    couponTaken = null;

    // Cash on delivery: the items are now an order, so the cart is emptied.
    // An online order empties it once the payment goes through.
    if (!online) await Cart.deleteOne({ customer: req.customer._id }).catch(() => {});

    // Remember a new address for next time
    if (saveAddress && !req.body.addressId && !req.isGuest) {
      req.customer.addresses.push({
        ...address,
        label: req.body.addressLabel || "Home",
        isDefault: req.customer.addresses.length === 0,
      });
      await req.customer.save().catch(() => {});
    }

    if (!online) {
      // Fire and forget: the customer should not wait for the mail server
      void sendOrderConfirmation(order);
      return res.status(201).json({
        success: true,
        message: "Order placed. We will confirm it shortly and you pay on delivery.",
        data: { orderId: order._id, orderNo: order.orderNo, totalAmount: order.totalAmount, paymentMethod },
      });
    }

    // Online payment: create the gateway order, remember it, and hand the details to the browser
    try {
      const gw = await createGatewayOrder({
        // amountPaise: Math.round(order.totalAmount * 100),
        amountPaise: 100,
        receipt: order.orderNo,
        notes: { orderNo: order.orderNo },
      });
      order.razorpayOrderId = gw.id;
      await order.save();
      await PaymentTransaction.create({
        order: order._id,
        razorpayOrderId: gw.id,
        status: "created",
        amount: order.totalAmount,
        tax: order.tax,
        requestPayload: { amount: gw.amount, currency: gw.currency, receipt: gw.receipt },
      });

      return res.status(201).json({
        success: true,
        message: "Order placed. Complete the payment to confirm it.",
        data: {
          orderId: order._id,
          orderNo: order.orderNo,
          totalAmount: order.totalAmount,
          paymentMethod,
          payment: {
            key: gatewayPublicKey(),
            razorpayOrderId: gw.id,
            amount: gw.amount,
            currency: gw.currency,
            expiresAt: order.paymentExpiresAt,
          },
        },
      });
    } catch (gatewayError) {
      // Could not reach the gateway: do not leave a dead order holding stock
      console.error("gateway error:", gatewayError);
      await closeOrder(order, { status: "failed", by: "system", reason: "Could not start the online payment" });
      throw fail(502, "We could not start the payment. Please try again.");
    }
  } catch (err) {
    // Undo anything taken before the order existed
    if (reservedLines) await releaseStock(reservedLines).catch(() => {});
    if (couponTaken) await Coupon.updateOne({ _id: couponTaken, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } }).catch(() => {});
    // Two identical requests raced: the other one made the order, so answer with it
    if (err?.code === 11000 && req.body.idempotencyKey) {
      const winner = await Order.findOne({ customer: req.customer._id, idempotencyKey: String(req.body.idempotencyKey).trim().slice(0, 64) });
      if (winner) return await replayCheckout(res, winner).catch((e) => sendError(res, e));
    }
    return sendError(res, err);
  }
};

// ─── Payment confirmation (browser) ───────────────────────────────────────

export const verifyPayment = async (req, res) => {
  try {
    const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    if (!isObjectId(orderId) || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature)
      throw fail(400, "All payment fields are required.");

    // Must be the caller's own order AND the gateway order we created for it
    const order = await Order.findOne({ _id: orderId, customer: req.customer._id, razorpayOrderId });
    if (!order) throw fail(404, "Order not found.");

    const valid = verifyPaymentSignature({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });
    if (!valid) {
      await PaymentTransaction.create({
        order: order._id,
        razorpayOrderId,
        status: "failed",
        failureReason: "Invalid payment signature",
      });
      throw fail(400, "Payment verification failed.");
    }

    // The gateway order must have been created for this order's real total.
    // (In development the amount is deliberately a test value, so this is only
    // enforced in production: there a mismatch means ₹1 paid for a bigger order.)
    if (process.env.NODE_ENV === "production" && order.paymentStatus !== "paid") {
      const created = await PaymentTransaction.findOne({ order: order._id, razorpayOrderId })
        .select("requestPayload")
        .lean();
      const gatewayAmount = created?.requestPayload?.amount;
      if (gatewayAmount !== undefined && gatewayAmount !== Math.round(order.totalAmount * 100)) {
        console.error(
          `verify-payment amount mismatch for ${order.orderNo}: gateway ${gatewayAmount}, order ${Math.round(order.totalAmount * 100)}`,
        );
        throw fail(400, "Payment amount does not match the order. Please contact support.");
      }
    }

    await applyPayment(order, {
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
      payload: { source: "browser" },
      source: "browser",
    });

    return res.status(200).json({
      success: true,
      message: "Payment received. Your order is confirmed.",
      data: { orderId: order._id, orderNo: order.orderNo, status: order.status, paymentStatus: order.paymentStatus },
    });
  } catch (err) {
    return sendError(res, err);
  }
};

// ─── Razorpay webhook (server to server) ──────────────────────────────────

export const razorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    if (!verifyWebhookSignature(req.rawBody, signature))
      return res.status(400).json({ success: false, message: "Invalid signature." });

    const event = req.body?.event;
    const payment = req.body?.payload?.payment?.entity;

    if ((event === "payment.captured" || event === "order.paid") && payment) {
      const order = await Order.findOne({ razorpayOrderId: payment.order_id });
      if (order) {
        // The gateway order was created for exactly this total
        if (Math.round(order.totalAmount * 100) === payment.amount) {
          await applyPayment(order, { paymentId: payment.id, payload: payment, source: "webhook" });
        } else {
          console.error(`webhook amount mismatch for ${order.orderNo}: ${payment.amount}`);
        }
      }
    } else if (event === "payment.failed" && payment) {
      const order = await Order.findOne({ razorpayOrderId: payment.order_id });
      if (order && order.paymentStatus === "unpaid") {
        await PaymentTransaction.create({
          order: order._id,
          razorpayOrderId: payment.order_id,
          razorpayPaymentId: payment.id,
          status: "failed",
          amount: order.totalAmount,
          failureReason: payment.error_description || "Payment failed",
          responsePayload: payment,
        }).catch(() => {}); // already recorded
        // The order stays open so the customer can try again until it expires
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("webhook error:", err);
    return res.status(500).json({ success: false });
  }
};

// ─── My orders ────────────────────────────────────────────────────────────

const PRODUCT_FIELDS = "name slug thumbnail gallery";

export const getMyOrders = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);

    // Orders that failed before any payment was even started are noise: hide them
    const filter = { customer: req.customer._id, $nor: [{ status: "failed", razorpayOrderId: { $exists: false } }] };
    const total = await Order.countDocuments(filter);
    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("items.product", PRODUCT_FIELDS)
      .lean();

    return res.status(200).json({
      success: true,
      data: orders,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    return sendError(res, err);
  }
};

export const getMyOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = isObjectId(orderId)
      ? await Order.findOne({ _id: orderId, customer: req.customer._id })
          .populate("items.product", PRODUCT_FIELDS)
          .lean()
      : null;
    if (!order) throw fail(404, "Order not found.");
    return res.status(200).json({ success: true, data: order });
  } catch (err) {
    return sendError(res, err);
  }
};

/** A customer can cancel until the shop starts packing the order. */
export const cancelMyOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = isObjectId(orderId)
      ? await Order.findOne({ _id: orderId, customer: req.customer._id })
      : null;
    if (!order) throw fail(404, "Order not found.");

    if (!["pending", "confirmed"].includes(order.status))
      throw fail(400, `This order is "${order.status}" and can no longer be cancelled.`);

    await closeOrder(order, {
      status: "cancelled",
      by: "customer",
      reason: req.body.reason?.trim() || "Cancelled by customer",
    });

    return res.status(200).json({
      success: true,
      message: order.refundRequired
        ? "Order cancelled. Your payment will be refunded."
        : "Order cancelled.",
      data: order,
    });
  } catch (err) {
    return sendError(res, err);
  }
};


// ─── Public order tracking (no sign-in) ───────────────────────────────────

const digits = (s) => String(s || "").replace(/\D/g, "");

/**
 * POST /orders/track   Body: { orderNo, contact }
 *
 * Lets a guest follow an order with the order number plus the email or mobile
 * number it was placed with. Only tracking details are returned (no address,
 * payment or contact data). Any mismatch gives the same "not found" answer, so
 * the endpoint cannot be used to check which order numbers exist.
 */
export const trackOrder = async (req, res) => {
  try {
    const orderNo = String(req.body.orderNo || "").trim().toUpperCase();
    const contact = String(req.body.contact || "").trim();
    if (!orderNo || !contact)
      throw fail(400, "Enter your order number and the email or mobile number used for the order.");

    const notFound = () => fail(404, "We couldn't find an order matching those details. Please check and try again.");

    const order = await Order.findOne({ orderNo }).populate("items.product", "name thumbnail gallery").lean();
    if (!order) throw notFound();

    const isEmail = contact.includes("@");
    const matches = isEmail
      ? String(order.customerEmail || "").toLowerCase() === contact.toLowerCase()
      : digits(contact).length >= 10 && digits(order.customerPhone).endsWith(digits(contact).slice(-10));
    if (!matches) throw notFound();

    return res.status(200).json({
      success: true,
      data: {
        orderNo: order.orderNo,
        createdAt: order.createdAt,
        status: order.status,
        statusHistory: (order.statusHistory || []).map((h) => ({ status: h.status, at: h.at })),
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        items: order.items.map((i) => ({
          name: i.name,
          variantName: i.variantName,
          quantity: i.quantity,
          image: i.image || i.product?.thumbnail || i.product?.gallery?.[0],
        })),
        courierName: order.courierName,
        trackingNumber: order.trackingNumber,
        trackingUrl: order.trackingUrl,
        estimatedDelivery: order.estimatedDelivery,
        shipmentStatus: order.shipmentStatus,
        trackingEvents: order.trackingEvents || [],
        shippedAt: order.shippedAt,
        deliveredAt: order.deliveredAt,
        cancelReason: order.status === "cancelled" ? order.cancelReason : undefined,
      },
    });
  } catch (err) {
    return sendError(res, err);
  }
};
