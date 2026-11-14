/**
 * Order lifecycle logic shared by the customer API, the admin API, the
 * Razorpay webhook and the expiry job.
 *
 *   placed (pending, unpaid)
 *     online: -> payment verified / webhook -> confirmed + paid
 *             -> not paid in time           -> failed (stock released)
 *     COD:    -> shop confirms              -> confirmed
 *   confirmed -> processing -> shipped -> delivered (COD is marked paid)
 *   pending / confirmed -> cancelled (stock released)
 */

import Order, { SHIPMENT_STATUSES } from "../models/order.model.js";
import { buildTrackingUrl, getProvider, providerName } from "../utils/shipping.js";
import { getCommerceSettings } from "../utils/orderPricing.js";
import { issueCreditNote } from "./invoiceService.js";
import { sendOrderConfirmation } from "./orderEmail.js";
import Coupon from "../models/coupon.model.js";
import Cart from "../models/cart.model.js";
import PaymentTransaction from "../models/paymentTransaction.model.js";
import { releaseOrderStock } from "../utils/stock.js";
import { refundGatewayPayment } from "../utils/razorpayGateway.js";

// Which status can follow which (admin changes). Cancelling is only possible
// before the parcel leaves.
export const TRANSITIONS = {
  pending: ["confirmed", "cancelled", "failed"],
  confirmed: ["processing", "shipped", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["out_for_delivery", "delivered", "returned"],
  out_for_delivery: ["delivered", "returned"],
  delivered: ["return_requested", "returned"],
  return_requested: ["delivered", "returned"], // back to delivered when the request is turned down
  cancelled: [],
  returned: ["refunded"],
  refunded: [],
  failed: [],
};

export const addHistory = (order, status, by, note) =>
  order.statusHistory.push({ status, by, note, at: new Date() });

/** Gives the coupon use back when an order that used it does not go ahead. */
async function releaseCoupon(order) {
  if (!order.couponCode) return;
  await Coupon.updateOne({ code: order.couponCode, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
}

/**
 * Ends an order that will not go ahead (cancelled by the customer or shop, or
 * payment never completed): puts the stock and coupon use back and records it.
 */
export async function closeOrder(order, { status, by, reason }) {
  order.status = status;
  order.cancelledAt = new Date();
  order.cancelReason = reason;
  // Money already taken has to be given back
  if (order.paymentStatus === "paid") order.refundRequired = true;
  addHistory(order, status, by, reason);
  await order.save();
  await releaseOrderStock(Order, order);
  await releaseCoupon(order);
  return order;
}

/**
 * Records a successful online payment. Safe to call twice for the same
 * payment (the browser verification and the webhook both arrive).
 */
export async function applyPayment(order, { paymentId, signature, payload, source }) {
  if (order.paymentStatus === "paid" && order.paymentId === paymentId) return order;

  // A second, different payment for an order that is already paid (retry in another tab,
  // double click on Pay): keep the first payment, record this one and flag it for a refund.
  if (order.paymentStatus === "paid" && order.paymentId && order.paymentId !== paymentId) {
    if (!(await PaymentTransaction.exists({ razorpayPaymentId: paymentId }))) {
      await PaymentTransaction.create({
        order: order._id,
        razorpayOrderId: order.razorpayOrderId,
        razorpayPaymentId: paymentId,
        status: "captured",
        amount: order.totalAmount,
        paidAt: new Date(),
        responsePayload: { ...payload, duplicate: true },
      });
      order.adminNote = [order.adminNote, `DUPLICATE PAYMENT ${paymentId} received after the order was already paid (${order.paymentId}). Refund it in the Razorpay dashboard.`].filter(Boolean).join("\n");
      await order.save();
      console.error(`duplicate payment ${paymentId} for order ${order.orderNo}`);
    }
    return order;
  }

  let tx = await PaymentTransaction.findOne({ razorpayPaymentId: paymentId });
  if (!tx) tx = await PaymentTransaction.findOne({ order: order._id, razorpayOrderId: order.razorpayOrderId });
  if (!tx) tx = new PaymentTransaction({ order: order._id, razorpayOrderId: order.razorpayOrderId });

  tx.razorpayPaymentId = paymentId;
  if (signature) tx.razorpaySignature = signature;
  tx.status = "captured";
  tx.amount = order.totalAmount;
  tx.tax = order.tax;
  tx.paidAt = new Date();
  tx.responsePayload = payload;
  await tx.save();

  order.paymentStatus = "paid";
  order.paymentId = paymentId;
  order.paidAt = new Date();

  if (order.status === "pending") {
    order.status = "confirmed";
    addHistory(order, "confirmed", "system", `Payment received (${source})`);
  } else if (["cancelled", "failed"].includes(order.status)) {
    // The money arrived after the order was closed: keep it visible
    order.refundRequired = true;
    order.adminNote = [order.adminNote, "Payment arrived after this order was closed. Refund it or recreate the order."]
      .filter(Boolean)
      .join("\n");
  }
  await order.save();
  // The customer has paid for what was in their cart
  await Cart.deleteOne({ customer: order.customer }).catch(() => {});
  // The order is now placed for real; the email is sent once however many times this runs
  if (!["cancelled", "failed"].includes(order.status)) void sendOrderConfirmation(order);
  return order;
}

// ─── Shipping ─────────────────────────────────────────────────────────────

const httpError = (status, message) => Object.assign(new Error(message), { status });

/** COD cash is collected at the door, so a delivered COD order is paid. */
function settleCodOnDelivery(order) {
  if (order.paymentMethod === "cod" && order.paymentStatus === "unpaid") {
    order.paymentStatus = "paid";
    order.paidAt = new Date();
  }
}

/**
 * Hands the order to the courier: records the courier and tracking details,
 * moves it to "shipped" and starts the tracking timeline. With no tracking
 * number and a courier integration connected, the integration books the parcel.
 * The caller saves the order.
 */
export async function shipOrder(order, { courierName, trackingNumber, trackingUrl, estimatedDelivery, by = "admin", note }) {
  const provider = getProvider();
  const details = { courierName, trackingNumber, trackingUrl, estimatedDelivery };

  if (!trackingNumber && provider.createShipment) {
    try {
      Object.assign(details, await provider.createShipment(order));
    } catch (err) {
      console.error("createShipment failed:", err);
      throw httpError(502, "The courier did not accept the shipment. Please try again or enter the tracking details by hand.");
    }
    order.shipmentProvider = providerName();
  }

  if (details.courierName !== undefined) order.courierName = details.courierName;
  if (details.trackingNumber !== undefined) order.trackingNumber = details.trackingNumber;
  if (details.shipmentId) order.shipmentId = details.shipmentId;
  if (details.estimatedDelivery) order.estimatedDelivery = details.estimatedDelivery;

  if (details.trackingNumber) {
    const template = (await getCommerceSettings()).trackingUrlTemplate;
    order.trackingUrl = buildTrackingUrl({ trackingNumber: order.trackingNumber, trackingUrl: details.trackingUrl, template });
  }

  order.status = "shipped";
  order.shippedAt = new Date();
  addHistory(order, "shipped", by, note);
  order.shipmentStatus ??= "label_created";
  order.trackingEvents.push({
    status: "label_created",
    description: order.courierName ? `Handed to ${order.courierName}` : "Order shipped",
    at: new Date(),
    source: by === "admin" ? "admin" : "system",
  });
  return order;
}

/**
 * Adds a tracking update (typed in by the shop, or pushed by a courier) and
 * moves the order along: "delivered" completes it, "returned_to_origin" marks
 * it returned. The caller saves the order.
 */
export function recordTrackingEvent(order, { status, description, location, at, source = "admin" }) {
  if (!SHIPMENT_STATUSES.includes(status)) throw httpError(400, `Unknown tracking status "${status}".`);
  if (!["confirmed", "processing", "shipped", "out_for_delivery"].includes(order.status))
    throw httpError(400, `An order that is "${order.status}" cannot get tracking updates.`);

  const time = at ? new Date(at) : new Date();
  if (Number.isNaN(time.getTime())) throw httpError(400, "The update time is not valid.");

  // A courier may send the same scan twice
  const duplicate = order.trackingEvents.some(
    (e) => e.status === status && Math.abs(new Date(e.at) - time) < 1000 && (e.description || "") === (description || ""),
  );
  if (duplicate) return order;

  order.trackingEvents.push({ status, description, location, at: time, source });
  // The timeline is shown newest last; the headline status follows the latest update
  const latest = order.trackingEvents.reduce((a, b) => (new Date(b.at) >= new Date(a.at) ? b : a));
  order.shipmentStatus = latest.status;

  // The parcel moving means the order has shipped
  if (!["shipped", "out_for_delivery"].includes(order.status) && status !== "label_created") {
    order.status = "shipped";
    order.shippedAt ??= time;
    addHistory(order, "shipped", source === "courier" ? "system" : "admin", "Parcel in transit");
  }

  if (status === "delivered" && order.status !== "delivered") {
    order.status = "delivered";
    order.deliveredAt = time;
    settleCodOnDelivery(order);
    addHistory(order, "delivered", source === "courier" ? "system" : "admin", description);
  } else if (status === "returned_to_origin" && ["shipped", "out_for_delivery"].includes(order.status)) {
    order.status = "returned";
    addHistory(order, "returned", source === "courier" ? "system" : "admin", description || "Returned to the shop");
  }
  return order;
}

/** Marks an order delivered from the order-status control (no courier scan). */
export function markDelivered(order, { by = "admin", note } = {}) {
  order.status = "delivered";
  order.deliveredAt ??= new Date(); // keeps the original date when a return request is turned down
  settleCodOnDelivery(order);
  addHistory(order, "delivered", by, note);
  if (order.shipmentStatus !== "delivered") {
    order.shipmentStatus = "delivered";
    order.trackingEvents.push({ status: "delivered", description: "Delivered", at: new Date(), source: by === "admin" ? "admin" : "system" });
  }
  return order;
}

/** Asks the connected courier for the latest scans and records the new ones. */
export async function refreshTracking(order) {
  const provider = getProvider();
  if (!provider.fetchTracking) throw httpError(400, "No courier integration is connected, so tracking updates are entered by hand.");
  if (!order.trackingNumber) throw httpError(400, "This order has no tracking number yet.");

  let events;
  try {
    events = await provider.fetchTracking(order);
  } catch (err) {
    console.error("fetchTracking failed:", err);
    throw httpError(502, "The courier could not be reached. Please try again later.");
  }
  for (const e of [...events].sort((a, b) => new Date(a.at) - new Date(b.at))) {
    recordTrackingEvent(order, { ...e, source: "courier" });
  }
  return order;
}

/** Refunds a paid online order, in full or in part. Returns the updated order. */
export async function refundOrder(order, { amount, reason }) {
  if (order.paymentMethod !== "razorpay" || !order.paymentId) {
    throw Object.assign(new Error("Only online payments can be refunded here."), { status: 400 });
  }
  const tx = await PaymentTransaction.findOne({ razorpayPaymentId: order.paymentId });
  if (!tx) throw Object.assign(new Error("Payment record not found."), { status: 404 });

  const refundable = Math.round((tx.amount - tx.amountRefunded) * 100) / 100;
  const value = amount === undefined || amount === "" ? refundable : Number(amount);
  if (!(value > 0) || value > refundable) {
    throw Object.assign(new Error(`Refund must be between ₹0.01 and ₹${refundable}.`), { status: 400 });
  }

  const refund = await refundGatewayPayment(order.paymentId, Math.round(value * 100), { reason: reason || "" });

  tx.amountRefunded = Math.round((tx.amountRefunded + value) * 100) / 100;
  tx.razorpayRefundId = refund.id;
  tx.status = tx.amountRefunded >= tx.amount ? "refunded" : "partially_refunded";
  tx.refundedAt = new Date();
  tx.responsePayload = refund;
  await tx.save();

  order.paymentStatus = tx.amountRefunded >= tx.amount ? "refunded" : "partially_refunded";
  if (order.paymentStatus === "refunded") order.refundRequired = false;
  order.adminNote = [order.adminNote, `Refunded ₹${value}${reason ? `: ${reason}` : ""}`].filter(Boolean).join("\n");
  // A refund after the invoice was issued needs a credit note
  await issueCreditNote(order, { amount: value, reason, refundId: refund.id });
  await order.save();
  return order;
}
