import crypto from "node:crypto";
import { Router } from "express";
import Order from "../models/order.model.js";
import { recordTrackingEvent } from "../services/orderService.js";

/**
 * POST /shipping/webhook
 *
 * Where a courier (or an aggregator such as Shiprocket) reports parcel
 * updates. It is switched off until SHIPPING_WEBHOOK_SECRET is set, and every
 * call must send that secret in the "x-shipping-secret" header.
 *
 * Body (one update, or { events: [...] } for several):
 *   { trackingNumber, status, description?, location?, at? }
 * `status`: label_created | picked_up | in_transit | out_for_delivery |
 *           delivered | delivery_failed | returned_to_origin
 *
 * If a courier sends its own format, translate it here to the shape above.
 */
const router = Router();

const sameSecret = (given) => {
  const secret = process.env.SHIPPING_WEBHOOK_SECRET;
  if (!secret || typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

router.post("/webhook", async (req, res) => {
  if (!process.env.SHIPPING_WEBHOOK_SECRET) return res.status(404).json({ success: false, message: "Not found." });
  if (!sameSecret(req.headers["x-shipping-secret"])) return res.status(401).json({ success: false, message: "Invalid secret." });

  try {
    const updates = Array.isArray(req.body?.events) ? req.body.events : [req.body];
    let applied = 0;
    const skipped = [];

    for (const u of updates) {
      const trackingNumber = String(u?.trackingNumber ?? "").trim();
      const order = trackingNumber ? await Order.findOne({ trackingNumber }) : null;
      if (!order) {
        skipped.push({ trackingNumber, reason: "no order with this tracking number" });
        continue;
      }
      try {
        recordTrackingEvent(order, {
          status: u.status,
          description: u.description?.toString().slice(0, 300),
          location: u.location?.toString().slice(0, 120),
          at: u.at,
          source: "courier",
        });
        await order.save();
        applied++;
      } catch (err) {
        skipped.push({ trackingNumber, reason: err.message });
      }
    }
    return res.status(200).json({ success: true, applied, skipped });
  } catch (err) {
    console.error("shipping webhook error:", err);
    return res.status(500).json({ success: false });
  }
});

export default router;
