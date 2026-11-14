import { unit, type CatalogProduct } from "./catalog";
import type { ArtKind, Tone } from "./data";
import type { CartLine } from "@/components/StoreProvider";

export const COUPON_KEY = "ofh-coupon-v1";

export const etaText = (days: readonly [number, number]) => {
  const f = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };
  return days[0] === days[1] ? f(days[0]) : `${f(days[0])} – ${f(days[1])}`;
};

/* ---------- cart pricing from live catalog data ---------- */
export type PricedRow = {
  line: CartLine;
  name: string;
  href: string;
  tone: Tone;
  kind?: ArtKind;
  image?: string;
  /** the chosen option, e.g. "18 inches" */
  variantName?: string;
  qty: number;
  price: number;
  mrp?: number;
  gone: boolean;
};

export const priceLines = (lines: CartLine[], byId: (id: string) => CatalogProduct | undefined): PricedRow[] =>
  lines.map((line) => {
    const p = byId(line.id);
    if (!p) return { line, name: "Unavailable product", href: "/shop", tone: "sand", qty: 0, price: 0, gone: true };
    const u = unit(p, line.variantId);
    const gone = u.stock <= 0;
    return {
      line,
      name: p.name,
      href: p.href,
      tone: p.tone,
      kind: p.kind,
      image: p.image,
      variantName: u.name,
      qty: gone ? 0 : Math.min(line.qty, u.stock),
      price: u.price,
      mrp: u.original,
      gone,
    };
  });

/** Figures shown on the order confirmation: the coupon, delivery and COD amounts come from the server. */
export const totalsFor = (rows: PricedRow[], couponOff: number, shippingFee: number, codFee = 0) => {
  const live = rows.filter((r) => !r.gone);
  const mrpTotal = live.reduce((a, r) => a + (r.mrp ?? r.price) * r.qty, 0);
  const sell = live.reduce((a, r) => a + r.price * r.qty, 0);
  return {
    mrpTotal,
    discount: mrpTotal - sell,
    couponOff,
    afterDiscount: sell - couponOff,
    shipping: shippingFee,
    codFee,
    total: sell - couponOff + shippingFee + codFee,
  };
};

/* ---------- orders (browser-only stand-in for the orders API) ---------- */
export type Address = {
  house: string;
  street: string;
  landmark: string;
  city: string;
  state: string;
  pin: string;
  country: string;
  type: "Home" | "Office" | "Other";
};

export type Order = {
  number: string;
  txn: string;
  createdAt: string;
  status: "paid" | "pending" | "failed";
  method: string;
  customer: { name: string; email: string; phone: string };
  address: Address;
  shipping: { label: string; eta: string; fee: number };
  items: { name: string; href: string; tone: Tone; kind?: ArtKind; image?: string; variantName?: string; qty: number; price: number }[];
  totals: ReturnType<typeof totalsFor>;
};

export const ORDERS_KEY = "ofh-orders-v1";
export const LAST_ORDER_KEY = "ofh-last-order-v1";
export const ADDRESS_KEY = "ofh-address-v1";


export const saveOrder = (o: Order) => {
  try {
    const all: Order[] = JSON.parse(localStorage.getItem(ORDERS_KEY) ?? "[]");
    localStorage.setItem(ORDERS_KEY, JSON.stringify([o, ...all.filter((x) => x.number !== o.number)]));
    localStorage.setItem(LAST_ORDER_KEY, o.number);
  } catch {
    /* storage unavailable */
  }
};

export const loadLastOrder = (): Order | null => {
  try {
    const n = localStorage.getItem(LAST_ORDER_KEY);
    const all: Order[] = JSON.parse(localStorage.getItem(ORDERS_KEY) ?? "[]");
    return all.find((o) => o.number === n) ?? null;
  } catch {
    return null;
  }
};

export const STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
  "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];
