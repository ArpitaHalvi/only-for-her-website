/**
 * Invoices, receipts and credit notes.
 *
 *   Tax invoice / bill of supply   issued when the order ships (the order's pre-save hook
 *                                  calls assignInvoice). Numbered in one running series per
 *                                  financial year, e.g. RW/2026-27/0001. Never reused.
 *   Payment receipt               shown for a paid online order before it ships. Not a tax
 *                                  document and not numbered (it carries the order number).
 *   Credit note                   issued for every refund after the invoice exists.
 *
 * Everything printed on an issued document is saved on the order (`snapshot`), so a later
 * download is identical and later price or settings changes cannot alter it.
 */

import AppConfig from "../models/appConfig.model.js";
import Product from "../models/product.model.js";
import { nextSequence } from "../models/counter.model.js";
import { findState } from "../utils/gstStates.js";

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const httpError = (status, message) => Object.assign(new Error(message), { status });

/** "2026-27" for a date in the Indian financial year (April to March), in IST. */
export function financialYear(date = new Date()) {
  const ist = new Date(new Date(date).getTime() + 330 * 60 * 1000);
  const year = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** The seller's details from App Configuration. */
async function sellerDetails() {
  const cfg = (await AppConfig.findOne().lean()) || {};
  const state = findState(cfg.businessState);
  return {
    registered: Boolean(cfg.gstRegistered),
    legalName: cfg.legalName || cfg.appName || "Only For Her",
    tradeName: cfg.appName || "Only For Her",
    gstin: cfg.gstin || "",
    address: cfg.businessAddress || cfg.companyAddress?.[0]?.address || "",
    state: state?.name || cfg.businessState || "",
    stateCode: state?.code || "",
    phone: cfg.phoneNumber || "",
    email: cfg.email || "",
    prefix: cfg.invoicePrefix || "RW",
    defaultHsn: cfg.defaultHsn || "",
    note: cfg.invoiceNote || "",
  };
}

/**
 * The lines of an order with their taxable value and GST. The order's discount is shared
 * over the lines in proportion to their value, and rounding is settled on the last line so
 * the lines always add up to the order's tax.
 */
function buildLines(order, registered, hsnByProduct, defaultHsn) {
  const items = order.items;
  const goods = items.reduce((s, i) => s + i.lineTotal, 0);
  const rate = registered ? order.taxRate || 0 : 0;
  const inclusive = order.taxMode === "inclusive";

  let discountLeft = round2(order.discount || 0);
  const lines = items.map((item, index) => {
    const last = index === items.length - 1;
    const share = last ? discountLeft : Math.min(discountLeft, round2(((order.discount || 0) * item.lineTotal) / (goods || 1)));
    discountLeft = round2(discountLeft - share);
    const gross = round2(item.lineTotal - share); // what this line costs after the discount

    let tax = 0;
    if (rate > 0) tax = round2(inclusive ? gross - gross / (1 + rate / 100) : (gross * rate) / 100);
    return {
      name: item.name,
      variantName: item.variantName || "",
      sku: item.sku || "",
      hsn: hsnByProduct.get(String(item.product)) || defaultHsn || "",
      quantity: item.quantity,
      unitPrice: item.price,
      discount: share,
      tax,
      taxRate: rate,
      gross,
    };
  });

  // Settle rounding so the lines add up to the order's tax
  if (registered && lines.length) {
    const diff = round2((order.tax || 0) - lines.reduce((s, l) => s + l.tax, 0));
    lines[lines.length - 1].tax = Math.max(0, round2(lines[lines.length - 1].tax + diff));
  }
  for (const l of lines) {
    l.taxableValue = inclusive ? round2(l.gross - l.tax) : l.gross;
    l.amount = inclusive ? l.gross : round2(l.gross + l.tax);
  }
  return lines;
}

/** Splits an amount of GST into CGST + SGST (same state), IGST (different states) or plain GST. */
function splitTax(amount, seller, supply) {
  if (!amount) return { cgst: 0, sgst: 0, igst: 0, gst: 0, mode: "none" };
  if (seller.stateCode && supply.stateCode) {
    if (seller.stateCode === supply.stateCode) {
      const cgst = round2(amount / 2);
      return { cgst, sgst: round2(amount - cgst), igst: 0, gst: 0, mode: "intra" };
    }
    return { cgst: 0, sgst: 0, igst: round2(amount), gst: 0, mode: "inter" };
  }
  return { cgst: 0, sgst: 0, igst: 0, gst: round2(amount), mode: "unknown" };
}

/** Everything printed on an invoice or receipt for this order, from the order's own data. */
async function buildSnapshot(order) {
  const seller = await sellerDetails();
  const products = await Product.find({ _id: { $in: order.items.map((i) => i.product) } }).select("hsnCode").lean();
  const hsnByProduct = new Map(products.map((p) => [String(p._id), p.hsnCode]));

  const a = order.shippingAddress;
  const state = findState(a.state);
  const supply = { state: state?.name || a.state || "", stateCode: state?.code || "" };
  const lines = buildLines(order, seller.registered, hsnByProduct, seller.defaultHsn);

  return {
    seller,
    kind: seller.registered ? "tax_invoice" : "bill_of_supply",
    placeOfSupply: supply,
    buyer: {
      name: order.customerName || a.fullName,
      email: order.customerEmail || "",
      phone: order.customerPhone || a.phone,
    },
    shipTo: {
      name: a.fullName,
      phone: a.phone,
      lines: [a.line1, a.line2, a.landmark].filter(Boolean),
      cityLine: `${a.city}, ${a.state} - ${a.pincode}`,
      country: a.country || "India",
    },
    taxMode: order.taxMode,
    taxRate: seller.registered ? order.taxRate || 0 : 0,
    lines,
    subtotal: order.subtotal,
    discount: order.discount || 0,
    couponCode: order.couponCode || "",
    shippingCharge: order.shippingCharge || 0,
    codCharge: order.codCharge || 0,
    giftWrapCharge: order.giftWrapCharge || 0,
    tax: order.tax || 0,
    taxSplit: splitTax(order.tax || 0, seller, supply),
    total: order.totalAmount,
  };
}

/**
 * Issues the invoice for an order that has shipped. Safe to call again (it does nothing
 * if the order already has one). The caller saves the order.
 */
export async function assignInvoice(order) {
  if (order.invoice?.number) return order;
  if (!["shipped", "out_for_delivery", "delivered", "return_requested", "returned", "refunded"].includes(order.status)) return order;

  const snapshot = await buildSnapshot(order);
  const date = order.shippedAt || new Date();
  const fy = financialYear(date);
  const seq = await nextSequence(`invoice-${snapshot.seller.prefix}-${fy}`);

  order.invoice = {
    number: `${snapshot.seller.prefix}/${fy}/${String(seq).padStart(4, "0")}`,
    date,
    financialYear: fy,
    kind: snapshot.kind,
    snapshot,
  };
  order.markModified("invoice");
  return order;
}

/**
 * Adds a credit note for money given back after the invoice was issued. Returns it, or
 * null when no invoice exists (nothing to correct). The caller saves the order.
 */
export async function issueCreditNote(order, { amount, reason, refundId }) {
  if (!order.invoice?.number || !(amount > 0)) return null;
  const invoice = order.invoice.snapshot;
  const taxable = invoice.kind === "tax_invoice" && order.totalAmount > 0;
  const taxAmount = taxable ? round2((amount * (order.tax || 0)) / order.totalAmount) : 0;

  const date = new Date();
  const fy = financialYear(date);
  const prefix = invoice.seller.prefix;
  const seq = await nextSequence(`creditnote-${prefix}-${fy}`);
  const note = {
    number: `${prefix}-CN/${fy}/${String(seq).padStart(4, "0")}`,
    date,
    amount: round2(amount),
    taxAmount,
    reason: reason || "",
    refundId: refundId || "",
    snapshot: { taxSplit: splitTax(taxAmount, invoice.seller, invoice.placeOfSupply) },
  };
  order.creditNotes.push(note);
  return note;
}

// ─── Documents handed to the PDF writer ───────────────────────────────────

const paymentLabel = (order) =>
  order.paymentMethod === "cod" ? "Cash on delivery" : "Online payment (Razorpay)";

/** Payment details are read live: a cash on delivery order becomes "paid" at delivery. */
function paymentBlock(order) {
  const paid = ["paid", "partially_refunded", "refunded"].includes(order.paymentStatus);
  return {
    method: paymentLabel(order),
    status: paid ? "PAID" : order.paymentMethod === "cod" ? "PAYABLE ON DELIVERY" : "UNPAID",
    paid,
    paidAt: order.paidAt || null,
    transactionId: order.paymentId || "",
    amountDue: paid ? 0 : order.totalAmount,
  };
}

/** Which downloads this order has right now (used by the storefront and the console). */
export function documentsFor(order) {
  const shipped = ["shipped", "out_for_delivery", "delivered", "return_requested", "returned", "refunded"].includes(order.status);
  const paidOnline = order.paymentMethod === "razorpay" && ["paid", "partially_refunded", "refunded"].includes(order.paymentStatus);
  return {
    invoice: shipped,
    receipt: !shipped && paidOnline && ["confirmed", "processing"].includes(order.status),
    creditNotes: (order.creditNotes || []).map((n) => ({ number: n.number, date: n.date, amount: n.amount })),
  };
}

/** The invoice (issuing it first if the order shipped before invoices existed). */
export async function invoiceDocument(order) {
  if (!["shipped", "out_for_delivery", "delivered", "return_requested", "returned", "refunded"].includes(order.status))
    throw httpError(409, "The invoice is available once your order has shipped.");
  if (!order.invoice?.number) {
    await assignInvoice(order);
    await order.save();
  }
  const s = order.invoice.snapshot;
  return {
    type: s.kind,
    title: s.kind === "tax_invoice" ? "TAX INVOICE" : "BILL OF SUPPLY",
    number: order.invoice.number,
    date: order.invoice.date,
    order: { no: order.orderNo, date: order.createdAt },
    payment: paymentBlock(order),
    ...s,
    filename: order.invoice.number.replace(/\//g, "-"),
  };
}

/** A payment receipt for an online order that is paid but not yet shipped. */
export async function receiptDocument(order) {
  if (!documentsFor(order).receipt) throw httpError(409, "A payment receipt is available for paid online orders until they ship.");
  const s = await buildSnapshot(order);
  return {
    type: "receipt",
    title: "PAYMENT RECEIPT",
    number: order.orderNo,
    date: order.paidAt || order.createdAt,
    order: { no: order.orderNo, date: order.createdAt },
    payment: paymentBlock(order),
    ...s,
    note: "This is a receipt for your payment. Your tax invoice is issued when the order ships.",
    filename: `receipt-${order.orderNo}`,
  };
}

/** One credit note, by its number. */
export function creditNoteDocument(order, number) {
  const note = (order.creditNotes || []).find((n) => n.number === number);
  if (!note || !order.invoice?.number) throw httpError(404, "Credit note not found.");
  const s = order.invoice.snapshot;
  return {
    type: "credit_note",
    title: "CREDIT NOTE",
    number: note.number,
    date: note.date,
    order: { no: order.orderNo, date: order.createdAt },
    against: { number: order.invoice.number, date: order.invoice.date },
    seller: s.seller,
    buyer: s.buyer,
    shipTo: s.shipTo,
    placeOfSupply: s.placeOfSupply,
    note: note.reason ? `Reason: ${note.reason}` : "",
    credit: { amount: note.amount, taxAmount: note.taxAmount, taxSplit: note.snapshot?.taxSplit, taxable: round2(note.amount - note.taxAmount) },
    gstRegistered: s.kind === "tax_invoice",
    filename: note.number.replace(/\//g, "-"),
  };
}
