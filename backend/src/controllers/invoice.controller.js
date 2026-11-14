/**
 * invoice.controller.js
 * Downloads of invoices, receipts and credit notes (PDF), for the customer and for the admin.
 */

import Order from "../models/order.model.js";
import { creditNoteDocument, invoiceDocument, issueCreditNote, receiptDocument } from "../services/invoiceService.js";
import { writePdf } from "../services/invoicePdf.js";

const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v));

const sendError = (res, err) => {
  if (err.status) return res.status(err.status).json({ success: false, message: err.message });
  console.error("invoice error:", err);
  return res.status(500).json({ success: false, message: "Could not create the document." });
};

const sendPdf = (res, data) => {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${data.filename}.pdf"`);
  res.setHeader("Cache-Control", "private, no-store");
  writePdf(data, res);
};

const documents = {
  invoice: (order) => invoiceDocument(order),
  receipt: (order) => receiptDocument(order),
};

/** One handler per kind. `mine` limits the lookup to the signed-in customer's orders. */
const handler = (kind, mine) => async (req, res) => {
  try {
    const id = mine ? req.params.orderId : req.params.id;
    const query = { _id: id };
    if (mine) query.customer = req.customer._id;
    const order = isObjectId(id) ? await Order.findOne(query) : null;
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });

    // The admin may open any order's invoice; a receipt is only for the customer's own view
    const data = kind === "credit-note" ? creditNoteDocument(order, decodeURIComponent(req.params.number)) : await documents[kind](order);
    return sendPdf(res, data);
  } catch (err) {
    return sendError(res, err);
  }
};

export const myInvoice = handler("invoice", true);
export const myReceipt = handler("receipt", true);
export const myCreditNote = handler("credit-note", true);
export const adminInvoice = handler("invoice", false);
export const adminReceipt = handler("receipt", false);
export const adminCreditNote = handler("credit-note", false);

/** POST /admin/orders/:id/credit-note  for a refund made outside the gateway (e.g. cash returned) */
export const createCreditNote = async (req, res) => {
  try {
    const order = isObjectId(req.params.id) ? await Order.findById(req.params.id) : null;
    if (!order) return res.status(404).json({ success: false, message: "Order not found." });
    if (!order.invoice?.number)
      return res.status(400).json({ success: false, message: "This order has no invoice yet, so there is nothing to credit." });

    const amount = Number(req.body.amount);
    const alreadyCredited = order.creditNotes.reduce((s, n) => s + n.amount, 0);
    if (!(amount > 0) || amount + alreadyCredited > order.totalAmount + 0.001)
      return res.status(400).json({
        success: false,
        message: `The credit must be more than 0 and at most ₹${Math.round((order.totalAmount - alreadyCredited) * 100) / 100} (what is left on the invoice).`,
      });

    const note = await issueCreditNote(order, { amount, reason: String(req.body.reason || "").trim().slice(0, 300) });
    await order.save();
    return res.status(201).json({ success: true, message: "Credit note created.", data: note });
  } catch (err) {
    return sendError(res, err);
  }
};
