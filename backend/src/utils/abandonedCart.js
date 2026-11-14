import Cart from "../models/cart.model.js";
import Customer from "../models/customer.model.js";
import Product from "../models/product.model.js";
import { sendMail } from "./mailer.js";

/**
 * Emails customers who left items in their cart for a day, once per cart
 * change. Off unless ABANDONED_CART_EMAILS=1, and only for customers who agreed
 * to marketing mail (marketingOptIn), so it never emails someone unexpectedly.
 * Returns how many reminders were sent.
 */
const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

export async function sendAbandonedCartReminders({ idleHours = 24, maxAgeDays = 7, batch = 50 } = {}) {
  const now = Date.now();
  const carts = await Cart.find({
    "items.0": { $exists: true },
    updatedAt: { $lt: new Date(now - idleHours * 3600 * 1000), $gt: new Date(now - maxAgeDays * 24 * 3600 * 1000) },
    $or: [{ reminderSentAt: null }, { $expr: { $lt: ["$reminderSentAt", "$updatedAt"] } }],
  }).limit(batch);

  const site = (process.env.NEXT_FRONTEND_URL || "").replace(/\/+$/, "");
  let sent = 0;

  for (const cart of carts) {
    try {
      const customer = await Customer.findById(cart.customer).select("email name isActive marketingOptIn");
      if (!customer?.email || customer.isActive === false || !customer.marketingOptIn) {
        // Nothing to send now; remember that so this cart is not looked at again until it changes
        await Cart.updateOne({ _id: cart._id }, { $set: { reminderSentAt: new Date() } }, { timestamps: false });
        continue;
      }

      // Claim first (without touching updatedAt): a crash must not mean a second email
      const claimed = await Cart.updateOne(
        { _id: cart._id, $or: [{ reminderSentAt: null }, { $expr: { $lt: ["$reminderSentAt", "$updatedAt"] } }] },
        { $set: { reminderSentAt: new Date() } },
        { timestamps: false },
      );
      if (claimed.modifiedCount !== 1) continue;

      const products = await Product.find({ _id: { $in: cart.items.map((i) => i.product) }, isActive: true }).select("name");
      if (!products.length) continue;
      const names = products.slice(0, 4).map((p) => p.name);

      await sendMail({
        to: customer.email,
        subject: "You left something in your cart",
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="margin:0 0 8px">Still thinking it over?</h2>
          <p>${customer.name ? `Hi ${esc(customer.name)}, y` : "Y"}our cart is waiting:</p>
          <ul>${names.map((n) => `<li>${esc(n)}</li>`).join("")}${products.length > 4 ? `<li>and ${products.length - 4} more</li>` : ""}</ul>
          <p><a href="${esc(site)}/cart">Go to your cart</a></p>
          <p style="color:#707f94;font-size:12px">You get this because you agreed to updates from us. Turn them off in your account settings any time.</p>
        </div>`,
      });
      sent += 1;
    } catch (err) {
      console.error("abandoned cart reminder failed:", err.message);
    }
  }
  return sent;
}

/** Runs the reminder job every `everyMinutes` (default hourly) when enabled. */
export function startAbandonedCartJob(everyMinutes = 60) {
  if (process.env.ABANDONED_CART_EMAILS !== "1") return null;
  const run = () =>
    sendAbandonedCartReminders()
      .then((n) => n && console.log(`Sent ${n} abandoned-cart reminder(s).`))
      .catch((err) => console.error("Abandoned cart job failed:", err.message));
  setTimeout(run, 60 * 1000).unref(); // not at the very start
  return setInterval(run, everyMinutes * 60 * 1000).unref();
}
