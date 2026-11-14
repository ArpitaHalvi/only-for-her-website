// Suggested values for the storefront navigation / filters. Products can use any
// value; these only make sure the menu lists every choice, even with no product yet.

export const DEITIES = [
  "Lord Ganesha",
  "Lord Shiva",
  "Lord Krishna",
  "Goddess Lakshmi",
  "Goddess Durga",
  "Lord Hanuman",
  "Om",
  "Other spiritual symbols",
];

export const OCCASIONS = [
  "Diwali",
  "Raksha Bandhan",
  "Karwa Chauth",
  "Wedding",
  "Anniversary",
  "Birthday",
  "Daily wear",
  "Religious",
];

/** Facet rows [{value,count}] with every suggested value added (count 0 when no product has it). */
export function withDefaults(rows, defaults) {
  const seen = new Map(rows.map((r) => [String(r.value).toLowerCase(), r]));
  const out = defaults.map((d) => seen.get(d.toLowerCase()) || { value: d, count: 0 });
  for (const r of rows) if (!defaults.some((d) => d.toLowerCase() === String(r.value).toLowerCase())) out.push(r);
  return out;
}
