/**
 * Order confirmation email: sent once, when an order is successfully placed
 * (cash on delivery: as soon as it is placed; online: when the payment is received).
 */

import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import { sendMail } from "../utils/mailer.js";

const SITE = () => (process.env.NEXT_FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const rupees = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dateText = (d) =>
  new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

export function buildHtml(order, slugs) {
  const paid = order.paymentStatus === "paid";
  const payment =
    order.paymentMethod === "cod"
      ? `Cash on delivery — pay ${rupees(order.totalAmount)} when it arrives`
      : paid
        ? `Paid online${order.paymentId ? ` (payment ID ${esc(order.paymentId)})` : ""}`
        : "Online payment";

  const rows = order.items
    .map((item) => {
      const slug = slugs.get(String(item.product));
      const link = slug ? `${SITE()}/products/${encodeURIComponent(slug)}` : null;
      const name = link
        ? `<a href="${esc(link)}" style="color:#b0420a;text-decoration:none;font-weight:600;">${esc(item.name)}</a>`
        : `<strong>${esc(item.name)}</strong>`;
      const details = [item.variantName, item.sku && `SKU ${item.sku}`].filter(Boolean).map(esc).join(" · ");
      const image = item.image
        ? `<img src="${esc(item.image)}" alt="" width="64" height="64" style="width:64px;height:64px;object-fit:cover;border-radius:6px;display:block;" />`
        : "";
      return `
        <tr>
          <td style="padding:12px 8px 12px 0;border-bottom:1px solid #eee;width:72px;">${image}</td>
          <td style="padding:12px 8px;border-bottom:1px solid #eee;font-size:14px;color:#171717;">
            ${name}
            ${details ? `<div style="font-size:12px;color:#707f94;margin-top:2px;">${details}</div>` : ""}
            <div style="font-size:12px;color:#707f94;margin-top:2px;">${rupees(item.price)} × ${item.quantity}</div>
          </td>
          <td style="padding:12px 0 12px 8px;border-bottom:1px solid #eee;font-size:14px;text-align:right;white-space:nowrap;">${rupees(item.lineTotal)}</td>
        </tr>`;
    })
    .join("");

  const total = (label, value, strong = false) => {
    const style = `padding:4px 0;font-size:${strong ? 16 : 14}px;color:${strong ? "#171717" : "#3d4a5c"};${strong ? "font-weight:700;" : ""}`;
    return `<tr><td style="${style}">${label}</td><td style="${style}text-align:right;">${value}</td></tr>`;
  };

  const a = order.shippingAddress;
  const address = [a.fullName, a.line1, a.line2, a.landmark, `${a.city}, ${a.state} ${a.pincode}`, a.country, `Phone: ${a.phone}`]
    .filter(Boolean)
    .map(esc)
    .join("<br />");

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:32px;border:1px solid #e5e7eb;border-radius:12px;">
      ${logoHtml("Only For Her")}
      <h3 style="margin:16px 0 4px;color:#171717;">Thank you, ${esc(order.customerName || a.fullName)}! Your order is placed.</h3>
      <p style="color:#3d4a5c;font-size:14px;margin:0 0 20px;">
        Order <strong>${esc(order.orderNo)}</strong> · ${dateText(order.createdAt)}
      </p>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;">
        ${total("Subtotal", rupees(order.subtotal))}
        ${order.discount ? total(`Discount${order.couponCode ? ` (${esc(order.couponCode)})` : ""}`, `− ${rupees(order.discount)}`) : ""}
        ${total("Shipping", order.shippingCharge ? rupees(order.shippingCharge) : "Free")}
        ${order.codCharge ? total("Cash on delivery fee", rupees(order.codCharge)) : ""}
        ${order.giftWrapCharge ? total("Gift wrapping", rupees(order.giftWrapCharge)) : ""}
        ${order.tax ? total(order.taxMode === "exclusive" ? "GST" : "Includes GST", rupees(order.tax)) : ""}
        ${total("Total", rupees(order.totalAmount), true)}
      </table>

      <div style="margin-top:24px;background:#fff7ed;border-radius:10px;padding:16px;font-size:14px;color:#3d4a5c;">
        <strong style="color:#171717;">Payment</strong><br />${payment}
      </div>
      <div style="margin-top:12px;background:#fff7ed;border-radius:10px;padding:16px;font-size:14px;color:#3d4a5c;line-height:1.5;">
        <strong style="color:#171717;">Delivering to</strong><br />${address}
      </div>

      <p style="margin:24px 0 0;text-align:center;">
        <a href="${SITE()}/account" style="display:inline-block;background:#b0420a;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:6px;">View my order</a>
      </p>
      <p style="color:#707f94;font-size:12px;margin-top:24px;">
        We will email you again when your order ships. Questions? Contact us through our website.
      </p>
    </div>`;
}

/**
 * Emails the order details to the customer. Safe to call more than once for the
 * same order (the browser verification and the webhook both reach the same
 * code): only the first call sends. Never throws, so a mail problem can never
 * undo an order.
 */
export async function sendOrderConfirmation(orderOrId) {
  const id = orderOrId?._id ?? orderOrId;
  try {
    // Claim the send atomically, so two concurrent calls cannot both send
    const claimed = await Order.findOneAndUpdate(
      { _id: id, confirmationEmailSentAt: null },
      { $set: { confirmationEmailSentAt: new Date() } },
      { new: true },
    );
    if (!claimed) return false;

    const release = () => Order.updateOne({ _id: id }, { $set: { confirmationEmailSentAt: null } }).catch(() => {});
    if (!claimed.customerEmail) return release().then(() => false);

    const products = await Product.find({ _id: { $in: claimed.items.map((i) => i.product) } }).select("slug");
    const slugs = new Map(products.map((p) => [String(p._id), p.slug]));

    try {
      const sent = await sendMail({
        to: claimed.customerEmail,
        subject: `Order ${claimed.orderNo} confirmed — Only For Her`,
        html: buildHtml(claimed, slugs),
        attachments: logoAttachments(),
      });
      if (!sent) await release(); // nothing went out
      return sent;
    } catch (err) {
      await release(); // allow a later retry
      throw err;
    }
  } catch (err) {
    console.error("Order confirmation email failed:", err.message);
    return false;
  }
}
