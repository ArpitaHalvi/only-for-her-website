import Order from "../models/order.model.js";
import { closeOrder } from "../services/orderService.js";

/**
 * Online orders that were never paid hold stock. Once their payment window
 * has passed they are closed as "failed" and the stock and coupon use go back.
 * Returns how many orders were closed.
 */
export async function closeExpiredOrders() {
  const expired = await Order.find({
    paymentMethod: "razorpay",
    paymentStatus: "unpaid",
    status: "pending",
    paymentExpiresAt: { $lt: new Date() },
  }).limit(100);

  let closed = 0;
  for (const order of expired) {
    try {
      await closeOrder(order, { status: "failed", by: "system", reason: "Payment was not completed in time" });
      closed++;
    } catch (err) {
      console.error(`Could not close expired order ${order.orderNo}:`, err.message);
    }
  }
  return closed;
}

/** Runs closeExpiredOrders now and then every few minutes. */
export function startOrderExpiryJob(everyMinutes = 5) {
  const run = () =>
    closeExpiredOrders()
      .then((n) => n && console.log(`Closed ${n} unpaid order(s) and released their stock.`))
      .catch((err) => console.error("Order expiry job failed:", err.message));

  run();
  return setInterval(run, everyMinutes * 60 * 1000).unref();
}
