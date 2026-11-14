// Indian states and union territories with their GST state codes. Used to decide
// between CGST + SGST (seller and buyer in the same state) and IGST (different states).

export const GST_STATES = [
  ["Jammu and Kashmir", "01"],
  ["Himachal Pradesh", "02"],
  ["Punjab", "03"],
  ["Chandigarh", "04"],
  ["Uttarakhand", "05"],
  ["Haryana", "06"],
  ["Delhi", "07"],
  ["Rajasthan", "08"],
  ["Uttar Pradesh", "09"],
  ["Bihar", "10"],
  ["Sikkim", "11"],
  ["Arunachal Pradesh", "12"],
  ["Nagaland", "13"],
  ["Manipur", "14"],
  ["Mizoram", "15"],
  ["Tripura", "16"],
  ["Meghalaya", "17"],
  ["Assam", "18"],
  ["West Bengal", "19"],
  ["Jharkhand", "20"],
  ["Odisha", "21"],
  ["Chhattisgarh", "22"],
  ["Madhya Pradesh", "23"],
  ["Gujarat", "24"],
  ["Dadra and Nagar Haveli and Daman and Diu", "26"],
  ["Maharashtra", "27"],
  ["Andhra Pradesh", "37"],
  ["Karnataka", "29"],
  ["Goa", "30"],
  ["Lakshadweep", "31"],
  ["Kerala", "32"],
  ["Tamil Nadu", "33"],
  ["Puducherry", "34"],
  ["Andaman and Nicobar Islands", "35"],
  ["Telangana", "36"],
  ["Ladakh", "38"],
];

// Common short forms and old spellings people type
const ALIASES = {
  jk: "Jammu and Kashmir", "j&k": "Jammu and Kashmir", hp: "Himachal Pradesh", pb: "Punjab", ch: "Chandigarh",
  uk: "Uttarakhand", uttaranchal: "Uttarakhand", hr: "Haryana", dl: "Delhi", "new delhi": "Delhi", "nct of delhi": "Delhi",
  rj: "Rajasthan", up: "Uttar Pradesh", br: "Bihar", sk: "Sikkim", ar: "Arunachal Pradesh", nl: "Nagaland",
  mn: "Manipur", mz: "Mizoram", tr: "Tripura", ml: "Meghalaya", as: "Assam", wb: "West Bengal", jh: "Jharkhand",
  or: "Odisha", od: "Odisha", orissa: "Odisha", cg: "Chhattisgarh", chattisgarh: "Chhattisgarh", mp: "Madhya Pradesh",
  gj: "Gujarat", dd: "Dadra and Nagar Haveli and Daman and Diu", dn: "Dadra and Nagar Haveli and Daman and Diu",
  daman: "Dadra and Nagar Haveli and Daman and Diu", "daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
  "dadra and nagar haveli": "Dadra and Nagar Haveli and Daman and Diu", mh: "Maharashtra", ap: "Andhra Pradesh",
  ka: "Karnataka", kn: "Karnataka", ga: "Goa", ld: "Lakshadweep", kl: "Kerala", tn: "Tamil Nadu", py: "Puducherry",
  pondicherry: "Puducherry", an: "Andaman and Nicobar Islands", "andaman & nicobar islands": "Andaman and Nicobar Islands",
  ts: "Telangana", tg: "Telangana", la: "Ladakh",
};

const clean = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/\band\b/g, "&")
    .replace(/[^a-z&\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const byName = new Map(GST_STATES.map(([name, code]) => [clean(name), { name, code }]));
const byAlias = new Map(Object.entries(ALIASES).map(([k, v]) => [clean(k), byName.get(clean(v))]));

/** { name, code } for a state typed in any common way, or null if it is not recognised. */
export function findState(input) {
  const key = clean(input);
  if (!key) return null;
  return byName.get(key) ?? byAlias.get(key) ?? null;
}
