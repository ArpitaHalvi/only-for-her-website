// Small CSV writer for exports (orders, reports).

// A cell that starts with = + - @ would be run as a formula by Excel / Sheets,
// so it is prefixed with an apostrophe. Plain negative numbers are left alone.
const safe = (value) => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "yes" : "no";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** rows: array of objects. columns: [[header, key | (row) => value], ...] */
export function toCsv(rows, columns) {
  const head = columns.map(([h]) => safe(h)).join(",");
  const body = rows.map((row) => columns.map(([, get]) => safe(typeof get === "function" ? get(row) : row[get])).join(","));
  return `﻿${[head, ...body].join("\r\n")}\r\n`; // BOM so Excel reads UTF-8 (₹, names)
}

export function sendCsv(res, filename, rows, columns) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(200).send(toCsv(rows, columns));
}
