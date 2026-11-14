/**
 * Draws an invoice, receipt or credit note (from invoiceService) as an A4 PDF.
 * Look: white paper, the Only For Her logo, wine for headings and the table header, a gold rule.
 * DejaVu Sans is used for text because the standard PDF fonts have no rupee sign;
 * the title and thank-you line use the built-in Times for a serif touch.
 */

import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const fontDir = path.join(path.dirname(require.resolve("dejavu-fonts-ttf/package.json")), "ttf");
const FONT = path.join(fontDir, "DejaVuSans.ttf");
const FONT_BOLD = path.join(fontDir, "DejaVuSans-Bold.ttf");

const LOGO = path.join(path.dirname(fileURLToPath(import.meta.url)), "../assets/logo.png");
const LOGO_RATIO = 583 / 1106; // height / width of the logo file

const INK = "#2b1a20";
const FAINT = "#7d6b71";
const WINE = "#640f2b";
const GOLD = "#b88636";
const TINT = "#f7f2ec";
const LINE = "#ece3d9";

const M = 40; // page margin
const W = 595.28 - M * 2; // usable width

const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "-";

export function writePdf(data, stream) {
  const pdf = new PDFDocument({ size: "A4", margins: { top: M, bottom: 20, left: M, right: M }, info: { Title: `${data.title} ${data.number}`, Author: data.seller.legalName } });
  pdf.registerFont("R", FONT);
  pdf.registerFont("B", FONT_BOLD);
  pdf.pipe(stream);

  const text = (str, x, y, opt = {}) => pdf.text(str, x, y, { lineBreak: true, ...opt });
  const set = (font, size, color = INK) => pdf.font(font).fontSize(size).fillColor(color);
  const rule = (y, color = LINE) => pdf.moveTo(M, y).lineTo(M + W, y).strokeColor(color).lineWidth(0.7).stroke();

  // ── Header: logo on the left, title and seller details on the right ──
  const s = data.seller;
  let headerBottom = M;
  if (fs.existsSync(LOGO)) {
    pdf.image(LOGO, M, M, { width: 150 });
    headerBottom = M + 150 * LOGO_RATIO;
  } else {
    set("B", 17, WINE);
    text(s.legalName, M, M, { width: 300 });
    headerBottom = pdf.y;
  }

  const rx = M + W - 300;
  set("Times-Bold", 24, WINE);
  text(data.title.toUpperCase(), rx, M, { width: 300, align: "right", characterSpacing: 1.2 });
  let ry = pdf.y + 5;
  set("B", 9.5);
  text(s.legalName, rx, ry, { width: 300, align: "right" });
  ry = pdf.y + 1;
  set("R", 8.5, FAINT);
  for (const line of [s.address, s.gstin && `GSTIN: ${s.gstin}`, [s.phone, s.email].filter(Boolean).join("  |  ")].filter(Boolean)) {
    text(line, rx, ry, { width: 300, align: "right" });
    ry = pdf.y + 1;
  }

  // ── Gold rule, then document facts (right) and who it is for (left) ──
  let y = Math.max(headerBottom, ry) + 14;
  pdf.rect(M, y, W, 2).fill(GOLD);
  y += 16;
  const topFacts = y;

  const facts = [
    [data.type === "receipt" ? "Receipt for order" : data.type === "credit_note" ? "Credit note no." : "Invoice no.", data.number],
    ["Date", day(data.date)],
    data.against ? ["Against invoice", `${data.against.number} (${day(data.against.date)})`] : ["Order no.", data.order.no],
    data.against ? ["Order no.", data.order.no] : ["Order date", day(data.order.date)],
    data.placeOfSupply?.state && ["Place of supply", `${data.placeOfSupply.state}${data.placeOfSupply.stateCode ? ` (${data.placeOfSupply.stateCode})` : ""}`],
  ].filter(Boolean);

  const factX = M + W / 2 + 20;
  let fy = topFacts;
  for (const [k, v] of facts) {
    set("R", 8.5, FAINT);
    text(k, factX, fy, { width: 90 });
    set("B", 8.5);
    text(String(v), factX + 95, fy, { width: W / 2 - 115 });
    fy = Math.max(fy + 14, pdf.y + 2);
  }

  const boxW = W / 2 - 10;
  const box = (title, name, lines, x, top) => {
    set("B", 8.5, WINE);
    text(title.toUpperCase(), x, top, { width: boxW });
    set("B", 10);
    text(name, x, pdf.y + 3, { width: boxW });
    set("R", 9, FAINT);
    for (const l of lines.filter(Boolean)) text(l, x, pdf.y + 1, { width: boxW });
    return pdf.y;
  };
  const billEnd = box("Billed to", data.buyer.name, [data.buyer.email, data.buyer.phone], M, topFacts);
  y = Math.max(fy, billEnd) + 10;

  const shipTop = y;
  const shipEnd = box("Ship to", data.shipTo.name, [...data.shipTo.lines, data.shipTo.cityLine, data.shipTo.country, data.shipTo.phone], M, shipTop);
  y = Math.max(shipEnd, y) + 14;

  // ── Line items (invoices and receipts) ───────────────────────────────
  const gst = data.type !== "credit_note" && data.taxRate > 0;
  if (data.lines) {
    const cols = gst
      ? [["#", 18, "left"], ["Item", 146, "left"], ["HSN", 62, "left"], ["Qty", 30, "right"], ["Rate", 58, "right"], ["Taxable", 58, "right"], [`GST`, 48, "right"], ["Amount", 0, "right"]]
      : [["#", 18, "left"], ["Item", 250, "left"], ["Qty", 36, "right"], ["Rate", 80, "right"], ["Discount", 70, "right"], ["Amount", 0, "right"]];
    const fixed = cols.reduce((n, c) => n + c[1], 0);
    cols[cols.length - 1][1] = W - fixed;
    const xs = [];
    cols.reduce((x, c) => (xs.push(x), x + c[1]), M);

    const header = (top) => {
      pdf.rect(M, top, W, 22).fill(WINE);
      set("B", 8, "#ffffff");
      cols.forEach(([label, w, align], i) => text(label.toUpperCase(), xs[i] + 4, top + 7, { width: w - 8, align, characterSpacing: 0.4 }));
      return top + 22;
    };
    y = header(y);

    data.lines.forEach((l, i) => {
      const name = l.name + (l.variantName ? ` (${l.variantName})` : "");
      set("R", 9);
      const h = Math.max(pdf.heightOfString(name, { width: cols[1][1] - 8 }), 11) + 12;
      if (y + h > 760) {
        pdf.addPage();
        y = header(M);
      }
      const row = gst
        ? [String(i + 1), name, l.hsn || "-", String(l.quantity), rupees(l.unitPrice), rupees(l.taxableValue), `${l.taxRate}%\n${rupees(l.tax)}`, rupees(l.amount)]
        : [String(i + 1), name, String(l.quantity), rupees(l.unitPrice), l.discount > 0 ? rupees(l.discount) : "-", rupees(l.amount)];
      row.forEach((cell, c) => {
        set(c === 1 ? "R" : c === row.length - 1 ? "B" : "R", c === 6 ? 7.5 : 9);
        text(cell, xs[c] + 4, y + 6, { width: cols[c][1] - 8, align: cols[c][2] });
      });
      y += h;
      rule(y);
    });
    y += 14;
  }

  // ── Totals ────────────────────────────────────────────────────────────
  if (y > 650) {
    pdf.addPage();
    y = M;
  }
  const totalsX = M + W - 230;
  const row = (label, value, strong = false, color = INK) => {
    set(strong ? "B" : "R", strong ? 11 : 9, color);
    text(label, totalsX, y, { width: 140 });
    text(value, totalsX + 130, y, { width: 100, align: "right" });
    y += strong ? 20 : 15;
  };

  const totalsTop = y;
  if (data.type === "credit_note") {
    if (data.gstRegistered && data.credit.taxAmount > 0) {
      row("Taxable value", rupees(data.credit.taxable));
      const t = data.credit.taxSplit || {};
      if (t.cgst) row("CGST", rupees(t.cgst));
      if (t.sgst) row("SGST", rupees(t.sgst));
      if (t.igst) row("IGST", rupees(t.igst));
      if (t.gst) row("GST", rupees(t.gst));
    }
    y += 6;
    pdf.rect(totalsX - 8, y - 5, 238, 24).fill(TINT);
    y += 1;
    row("Total credited", rupees(data.credit.amount), true, WINE);
  } else {
    row("Subtotal", rupees(data.subtotal));
    if (data.discount > 0) row(`Discount${data.couponCode ? ` (${data.couponCode})` : ""}`, `-${rupees(data.discount)}`);
    if (gst) {
      const t = data.taxSplit;
      const inc = data.taxMode === "inclusive" ? " (included)" : "";
      if (t.cgst) {
        row(`CGST ${data.taxRate / 2}%${inc}`, rupees(t.cgst));
        row(`SGST ${data.taxRate / 2}%${inc}`, rupees(t.sgst));
      } else if (t.igst) row(`IGST ${data.taxRate}%${inc}`, rupees(t.igst));
      else row(`GST ${data.taxRate}%${inc}`, rupees(data.tax));
    } else if (data.tax > 0) row("Tax", rupees(data.tax));
    row("Shipping", data.shippingCharge > 0 ? rupees(data.shippingCharge) : "Free");
    if (data.codCharge > 0) row("Cash on delivery fee", rupees(data.codCharge));
    if (data.giftWrapCharge > 0) row("Gift wrapping", rupees(data.giftWrapCharge));
    y += 6;
    pdf.rect(totalsX - 8, y - 5, 238, 24).fill(TINT);
    y += 1;
    row("Total", rupees(data.total), true, WINE);
    if (data.payment.paid) row("Amount paid", rupees(data.total));
    else row("Amount payable", rupees(data.payment.amountDue), true);
  }
  const totalsEnd = y;

  // ── Payment box on the left ───────────────────────────────────────────
  if (data.payment) {
    let py = totalsTop;
    set("B", 8.5, WINE);
    text("PAYMENT", M, py, { width: 240 });
    py = pdf.y + 3;
    const lines = [
      ["Method", data.payment.method],
      ["Status", data.payment.status],
      data.payment.paidAt && ["Paid on", day(data.payment.paidAt)],
      data.payment.transactionId && ["Transaction ID", data.payment.transactionId],
    ].filter(Boolean);
    for (const [k, v] of lines) {
      set("R", 8.5, FAINT);
      text(k, M, py, { width: 80 });
      set("B", 8.5, data.payment.status === "PAID" && k === "Status" ? "#1a7f37" : INK);
      text(String(v), M + 82, py, { width: 160 });
      py = Math.max(py + 13, pdf.y + 1);
    }
  }

  // ── Notes ─────────────────────────────────────────────────────────────
  y = Math.max(totalsEnd, y) + 18;
  if (y > 740) {
    pdf.addPage();
    y = M;
  }
  rule(y);
  y += 10;
  set("R", 8, FAINT);
  const notes = [
    data.note,
    data.type === "bill_of_supply" && "Bill of Supply: the seller is not registered for GST and has charged no tax.",
    data.seller.note,
    "This is a computer-generated document and does not need a signature.",
  ].filter(Boolean);
  for (const n of notes) {
    text(n, M, y, { width: W });
    y = pdf.y + 3;
  }

  // ── Thank-you line at the foot of the last page ──
  if (y > 760) {
    pdf.addPage();
  }
  pdf.rect(M, 786, W, 2).fill(GOLD);
  set("Times-Italic", 11, WINE);
  text("Thank you for choosing Only For Her.", M, 796, { width: W, align: "center", lineBreak: false });

  pdf.end();
}
