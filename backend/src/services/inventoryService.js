import Product from "../models/product.model.js";
import StockMovement from "../models/stockMovement.model.js";
import StockAlert from "../models/stockAlert.model.js";
import { sendMail } from "../utils/mailer.js";

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

/** Records stock changes. Never throws: a ledger problem must not fail an order. */
export async function logMovements(entries) {
  if (!entries?.length) return;
  try {
    await StockMovement.insertMany(entries, { ordered: false });
  } catch (err) {
    console.error("stock ledger write failed:", err.message);
  }
}

/** Turns an order / return item into a ledger row. */
export const movementFor = (item, delta, reason, extra = {}) => ({
  product: item.product,
  variantId: item.variantId || null,
  name: item.name,
  sku: item.sku,
  delta,
  reason,
  ...extra,
});

/**
 * Emails everyone waiting for a product option that has come back in stock,
 * then marks those alerts as sent. Safe to call any time: it only acts when
 * there are unsent alerts AND the option really has stock.
 */
export async function notifyBackInStock(productId) {
  try {
    if (!(await StockAlert.exists({ product: productId, notifiedAt: null }))) return 0;

    const product = await Product.findById(productId).select("name slug isActive stock variants");
    if (!product || !product.isActive) return 0;

    const alerts = await StockAlert.find({ product: productId, notifiedAt: null }).limit(500);
    const siteUrl = (process.env.NEXT_FRONTEND_URL || "").replace(/\/+$/, "");
    let sent = 0;

    for (const alert of alerts) {
      const variant = alert.variantId ? product.variants.id(alert.variantId) : null;
      const available = alert.variantId
        ? (variant?.stock ?? 0) > 0
        : product.variants.length
          ? product.variants.some((v) => v.stock > 0)
          : product.stock > 0;
      if (!available) continue;

      const label = variant ? `${product.name} (${variant.name})` : product.name;
      // Mark first: a crash after sending must not email the same person twice
      const claimed = await StockAlert.updateOne(
        { _id: alert._id, notifiedAt: null },
        { $set: { notifiedAt: new Date() } },
      );
      if (claimed.modifiedCount !== 1) continue;

      await sendMail({
        to: alert.email,
        subject: `Back in stock: ${label}`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="margin:0 0 8px">Good news!</h2>
          <p><strong>${esc(label)}</strong> is back in stock. It may sell out again, so don't wait too long.</p>
          <p><a href="${esc(siteUrl)}/products/${esc(product.slug)}">View the product</a></p>
        </div>`,
      }).catch((err) => console.error("back-in-stock email failed:", err.message));
      sent += 1;
    }
    return sent;
  } catch (err) {
    console.error("notifyBackInStock failed:", err.message);
    return 0;
  }
}
