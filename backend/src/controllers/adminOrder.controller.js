/**
 * adminOrder.controller.js
 * Order management for the admin console (admin JWT).
 */

import Order, { ORDER_STATUSES, PAYMENT_STATUSES } from "../models/order.model.js";
import PaymentTransaction from "../models/paymentTransaction.model.js";
import { releaseOrderStock } from "../utils/stock.js";
import {
  TRANSITIONS,
  addHistory,
  closeOrder,
  markDelivered,
  recordTrackingEvent,
  refreshTracking,
  refundOrder,
  shipOrder,
} from "../services/orderService.js";
import { buildTrackingUrl, cleanUrl } from "../utils/shipping.js";
import { getCommerceSettings } from "../utils/orderPricing.js";
import { sendCsv } from "../utils/csv.js";

const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v));
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const sendError = (res, err) => {
  if (err.status) return res.status(err.status).json({ success: false, message: err.message });
  if (err.name === "ValidationError")
    return res.status(400).json({ success: false, message: Object.values(err.errors).map((e) => e.message).join(" ") });
  console.error("adminOrder error:", err);
  return res.status(500).json({ success: false, message: "Server error." });
};
const fail = (status, message) => Object.assign(new Error(message), { status });

async function findOrder(id) {
  const order = isObjectId(id) ? await Order.findById(id) : null;
  if (!order) throw fail(404, "Order not found.");
  return order;
}

/** Filters shared by the order list and the export: status, paymentStatus, paymentMethod, search, from, to, refundRequired, coupon */
function buildOrderQuery(params) {
  const req = { query: params };
    const { status, paymentStatus, paymentMethod, search, from, to, refundRequired } = req.query;

    const query = {};
    if (status) query.status = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (paymentMethod) query.paymentMethod = paymentMethod;
    if (refundRequired === "true") query.refundRequired = true;
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
    }
    if (search) {
      const rx = { $regex: escapeRegex(search.trim()), $options: "i" };
      query.$or = [
        { orderNo: rx },
        { customerName: rx },
        { customerEmail: rx },
        { customerPhone: rx },
        { razorpayOrderId: rx },
        { paymentId: rx },
        { trackingNumber: rx },
      ];
    }

    if (params.coupon) query.couponCode = String(params.coupon).trim().toUpperCase();
    return query;
}

// ─── GET all orders (paginated, filterable) ───────────────────────────────

export const getAllOrders = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const query = buildOrderQuery(req.query);

    const total = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("customer", "name email phone avatar")
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

// ─── GET one order (with its payment records) ─────────────────────────────

export const getOrderById = async (req, res) => {
  try {
    const order = isObjectId(req.params.id)
      ? await Order.findById(req.params.id).populate("customer", "name email phone avatar").lean()
      : null;
    if (!order) throw fail(404, "Order not found.");

    const transactions = await PaymentTransaction.find({ order: order._id })
      .sort({ createdAt: 1 })
      .select("-requestPayload -razorpaySignature")
      .lean();

    return res.status(200).json({
      success: true,
      data: { ...order, transactions, allowedStatuses: TRANSITIONS[order.status] ?? [] },
    });
  } catch (err) {
    return sendError(res, err);
  }
};

// ─── PATCH status / tracking / notes ──────────────────────────────────────

export const updateOrderStatus = async (req, res) => {
  try {
    const { status, trackingNumber, courierName, adminNote, cancelReason } = req.body;
    const order = await findOrder(req.params.id);

    // Tracking link and delivery estimate: undefined = leave alone, "" = clear
    const link = cleanUrl(req.body.trackingUrl);
    if (link === null) throw fail(400, "The tracking link must start with http:// or https://.");
    let estimate;
    if (req.body.estimatedDelivery !== undefined) {
      estimate = req.body.estimatedDelivery ? new Date(req.body.estimatedDelivery) : "";
      if (estimate && Number.isNaN(estimate.getTime())) throw fail(400, "The estimated delivery date is not valid.");
    }
    for (const [name, value] of [["Tracking number", trackingNumber], ["Courier", courierName]])
      if (value !== undefined && typeof value !== "string") throw fail(400, `${name} must be text.`);

    if (status && status !== order.status) {
      if (!ORDER_STATUSES.includes(status)) throw fail(400, `Invalid status "${status}".`);
      if (!(TRANSITIONS[order.status] ?? []).includes(status))
        throw fail(400, `An order that is "${order.status}" cannot become "${status}".`);

      // An online order has to be paid before the shop works on it
      if (
        order.paymentMethod === "razorpay" &&
        order.paymentStatus !== "paid" &&
        !["cancelled", "failed"].includes(status)
      )
        throw fail(400, "This online order has not been paid yet.");

      if (status === "cancelled" || status === "failed") {
        await closeOrder(order, { status, by: "admin", reason: cancelReason || "Cancelled by the shop" });
      } else if (status === "shipped") {
        await shipOrder(order, {
          courierName: courierName?.trim() || undefined,
          trackingNumber: trackingNumber?.trim() || undefined,
          trackingUrl: link,
          estimatedDelivery: estimate,
          note: req.body.note,
        });
      } else if (status === "delivered") {
        markDelivered(order, { note: req.body.note });
      } else {
        order.status = status;
        addHistory(order, status, "admin", req.body.note);
      }
    }

    // Shipment details can also be corrected on their own (before or after shipping)
    if (trackingNumber !== undefined) order.trackingNumber = trackingNumber.trim();
    if (courierName !== undefined) order.courierName = courierName.trim();
    if (estimate !== undefined) order.estimatedDelivery = estimate || undefined;
    // No link given: build one from the tracking number and the shop's default link
    if (link !== undefined || (trackingNumber !== undefined && !order.trackingUrl)) {
      order.trackingUrl =
        link ||
        buildTrackingUrl({
          trackingNumber: order.trackingNumber,
          template: (await getCommerceSettings()).trackingUrlTemplate,
        });
    }
    if (adminNote !== undefined) order.adminNote = adminNote;

    await order.save();
    return res.status(200).json({ success: true, message: "Order updated.", data: order });
  } catch (err) {
    return sendError(res, err);
  }
};

// ─── Tracking updates ─────────────────────────────────────────────────────

/** POST /:id/tracking  { status, description?, location?, at? } */
export const addTrackingUpdate = async (req, res) => {
  try {
    const order = await findOrder(req.params.id);
    const { status, description, location, at } = req.body;
    recordTrackingEvent(order, {
      status,
      description: description?.toString().trim().slice(0, 300) || undefined,
      location: location?.toString().trim().slice(0, 120) || undefined,
      at,
      source: "admin",
    });
    await order.save();
    return res.status(200).json({ success: true, message: "Tracking updated.", data: order });
  } catch (err) {
    return sendError(res, err);
  }
};

/** POST /:id/tracking/refresh  asks the connected courier for the latest scans */
export const refreshOrderTracking = async (req, res) => {
  try {
    const order = await findOrder(req.params.id);
    await refreshTracking(order);
    await order.save();
    return res.status(200).json({ success: true, message: "Tracking refreshed.", data: order });
  } catch (err) {
    return sendError(res, err);
  }
};

// ─── PATCH payment status (for cash on delivery and corrections) ──────────

export const updatePaymentStatus = async (req, res) => {
  try {
    const { paymentStatus } = req.body;
    const order = await findOrder(req.params.id);

    if (!PAYMENT_STATUSES.includes(paymentStatus)) throw fail(400, `Invalid payment status "${paymentStatus}".`);
    if (order.paymentMethod === "razorpay")
      throw fail(400, "Online payments are updated by Razorpay. Use Refund to give money back.");

    order.paymentStatus = paymentStatus;
    if (paymentStatus === "paid") order.paidAt = new Date();
    await order.save();
    return res.status(200).json({ success: true, message: "Payment status updated.", data: order });
  } catch (err) {
    return sendError(res, err);
  }
};

// ─── POST refund ──────────────────────────────────────────────────────────

export const refundOrderPayment = async (req, res) => {
  try {
    const order = await findOrder(req.params.id);
    const updated = await refundOrder(order, { amount: req.body.amount, reason: req.body.reason });
    return res.status(200).json({ success: true, message: "Refund issued.", data: updated });
  } catch (err) {
    return sendError(res, err);
  }
};

// ─── DELETE (only closed orders) ──────────────────────────────────────────

export const deleteOrder = async (req, res) => {
  try {
    const order = await findOrder(req.params.id);
    if (!["cancelled", "failed"].includes(order.status))
      throw fail(400, "Only cancelled or failed orders can be deleted. Cancel the order first.");
    await releaseOrderStock(Order, order); // normally already released
    await order.deleteOne();
    return res.status(200).json({ success: true, message: "Order deleted successfully." });
  } catch (err) {
    return sendError(res, err);
  }
};

// ─── Dashboard numbers ────────────────────────────────────────────────────

export const getOrderStats = async (req, res) => {
  try {
    const [statusCounts, paymentCounts, revenue, refundsDue] = await Promise.all([
      Order.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Order.aggregate([{ $group: { _id: "$paymentStatus", count: { $sum: 1 } } }]),
      Order.aggregate([
        { $match: { paymentStatus: { $in: ["paid", "partially_refunded"] }, status: { $nin: ["cancelled", "failed", "returned", "refunded"] } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      Order.countDocuments({ refundRequired: true }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalOrders: await Order.countDocuments(),
        totalRevenue: revenue[0]?.total || 0,
        refundsDue,
        byStatus: Object.fromEntries(statusCounts.map((s) => [s._id, s.count])),
        byPayment: Object.fromEntries(paymentCounts.map((s) => [s._id, s.count])),
      },
    });
  } catch (err) {
    return sendError(res, err);
  }
};

// ─── Export ───────────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/orders/export   same filters as the list (status, paymentStatus,
 * paymentMethod, search, from, to, coupon). Returns a CSV file, one row per item.
 */
export const exportOrders = async (req, res) => {
  try {
    const query = buildOrderQuery(req.query);
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .limit(20000)
      .select("orderNo createdAt customerName customerEmail customerPhone items subtotal discount couponCode shippingCharge codCharge tax totalAmount paymentMethod paymentStatus status shippingAddress trackingNumber courierName deliveredAt invoice.number")
      .lean();
    const rows = orders.flatMap((o) => (o.items?.length ? o.items : [{}]).map((item, i) => ({ o, item, first: i === 0 })));
    const money = (row, field) => (row.first ? row.o[field] : "");
    sendCsv(res, `orders-${new Date().toISOString().slice(0, 10)}.csv`, rows, [
      ["Order no", (r) => r.o.orderNo],
      ["Date", (r) => r.o.createdAt],
      ["Status", (r) => r.o.status],
      ["Payment method", (r) => r.o.paymentMethod],
      ["Payment status", (r) => r.o.paymentStatus],
      ["Customer", (r) => r.o.customerName],
      ["Email", (r) => r.o.customerEmail],
      ["Phone", (r) => r.o.customerPhone || r.o.shippingAddress?.phone],
      ["Product", (r) => r.item.name],
      ["Option", (r) => r.item.variantName],
      ["SKU", (r) => r.item.sku],
      ["Quantity", (r) => r.item.quantity],
      ["Unit price", (r) => r.item.price],
      ["Line total", (r) => r.item.lineTotal],
      ["Subtotal", (r) => money(r, "subtotal")],
      ["Discount", (r) => money(r, "discount")],
      ["Coupon", (r) => (r.first ? r.o.couponCode : "")],
      ["Shipping", (r) => money(r, "shippingCharge")],
      ["COD fee", (r) => money(r, "codCharge")],
      ["Tax", (r) => money(r, "tax")],
      ["Order total", (r) => money(r, "totalAmount")],
      ["City", (r) => (r.first ? r.o.shippingAddress?.city : "")],
      ["State", (r) => (r.first ? r.o.shippingAddress?.state : "")],
      ["Pincode", (r) => (r.first ? r.o.shippingAddress?.pincode : "")],
      ["Courier", (r) => (r.first ? r.o.courierName : "")],
      ["Tracking no", (r) => (r.first ? r.o.trackingNumber : "")],
      ["Invoice no", (r) => (r.first ? r.o.invoice?.number : "")],
      ["Delivered on", (r) => (r.first ? r.o.deliveredAt : "")],
    ]);
  } catch (err) {
    return sendError(res, err);
  }
};
