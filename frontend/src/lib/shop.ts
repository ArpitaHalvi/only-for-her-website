/*
 * Talks to the shop backend for pricing, coupons, orders and payment.
 * Prices, stock, coupons and totals are decided by the server; the browser only displays them.
 */
import { API_URL, getToken } from "./auth";
import type { PricedRow } from "./orders";

export class ShopError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status = 0, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function call<T = unknown>(path: string, opts: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? (opts.body ? "POST" : "GET"),
      headers: { "Content-Type": "application/json", ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ShopError("We couldn't reach the shop server. Check your connection and try again.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) throw new ShopError(json.message ?? "Something went wrong. Please try again.", res.status, json.code);
  return json as T;
}

/* ---------- the bag, as the server wants it ---------- */
export type ShopItem = { productId: string; variantId?: string; quantity: number };

export async function resolveItems(rows: PricedRow[]): Promise<ShopItem[]> {
  return rows
    .filter((r) => !r.gone && r.qty > 0)
    .map((r) => ({ productId: r.line.id, ...(r.line.variantId ? { variantId: r.line.variantId } : {}), quantity: r.qty }));
}

/* ---------- who is ordering: a signed-in customer, or a guest session ---------- */
const GUEST_KEY = "ofh-guest-token";
const guestToken = () => {
  try {
    return sessionStorage.getItem(GUEST_KEY);
  } catch {
    return null;
  }
};
export const orderToken = () => getToken() ?? guestToken();

export async function ensureSession(who: { name: string; email: string; phone: string }): Promise<{ token: string; guest: boolean }> {
  const t = getToken();
  if (t) return { token: t, guest: false };
  const res = await call<{ data: { token: string } }>("/orders/guest/session", { body: who });
  try {
    sessionStorage.setItem(GUEST_KEY, res.data.token);
  } catch {
    /* storage unavailable: the token is still used for this order */
  }
  return { token: res.data.token, guest: true };
}

/* ---------- price a cart ---------- */
export type Quote = {
  subtotal: number;
  discount: number;
  shippingCharge: number;
  codCharge: number;
  giftWrapCharge: number;
  tax: number;
  taxMode: "inclusive" | "exclusive";
  totalAmount: number;
  couponCode?: string;
  couponError?: string;
  paymentOptions: { method: "razorpay" | "cod"; enabled: boolean; fee: number; reason?: string }[];
  delivery?: { valid: boolean; serviceable: boolean; codAvailable: boolean; message?: string; minDays?: number; maxDays?: number };
};

export async function getQuote(items: ShopItem[], o: { couponCode?: string | null; paymentMethod?: "razorpay" | "cod"; pincode?: string } = {}): Promise<Quote> {
  const res = await call<{ data: Quote }>("/orders/quote", {
    body: { items, couponCode: o.couponCode || undefined, paymentMethod: o.paymentMethod, pincode: o.pincode || undefined },
    token: orderToken(),
  });
  return res.data;
}

/* ---------- place an order and pay ---------- */
export type CheckoutAddress = { fullName: string; phone: string; line1: string; line2?: string; landmark?: string; city: string; state: string; country: string; pincode: string };

export type Placed = {
  orderId: string;
  orderNo: string;
  totalAmount: number;
  paymentMethod: "razorpay" | "cod";
  payment?: { key: string; razorpayOrderId: string; amount: number; currency: string };
};

export async function placeOrder(token: string, body: { items: ShopItem[]; paymentMethod: "razorpay" | "cod"; couponCode?: string | null; shippingAddress: CheckoutAddress; idempotencyKey: string }): Promise<Placed> {
  const res = await call<{ data: Placed }>("/orders/checkout", { body: { ...body, couponCode: body.couponCode || undefined }, token });
  return res.data;
}

export async function verifyPayment(token: string, p: { orderId: string; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) {
  return call("/orders/verify-payment", { body: p, token });
}

/* ---------- Razorpay's payment window ---------- */
type RzpResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
declare global {
  interface Window {
    Razorpay?: new (o: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: { error?: { description?: string } }) => void) => void };
  }
}

function loadRazorpay(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new ShopError("Payments need a browser."));
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new ShopError("We couldn't load the payment window. Check your connection and try again."));
    document.head.appendChild(s);
  });
}

/** Opens the payment window. Resolves with the payment proof; rejects with a ShopError code "dismissed" or "failed". */
export async function payWithRazorpay(placed: Placed, who: { name: string; email: string; phone: string }): Promise<RzpResponse> {
  if (!placed.payment) throw new ShopError("This order has no online payment to make.");
  await loadRazorpay();
  const p = placed.payment;
  return new Promise<RzpResponse>((resolve, reject) => {
    const rz = new window.Razorpay!({
      key: p.key,
      amount: p.amount,
      currency: p.currency,
      order_id: p.razorpayOrderId,
      name: "Only For Her",
      description: `Order ${placed.orderNo}`,
      prefill: { name: who.name, email: who.email, contact: who.phone },
      theme: { color: "#640f2b" },
      handler: (r: RzpResponse) => resolve(r),
      modal: { ondismiss: () => reject(new ShopError("Payment was not completed.", 0, "dismissed")) },
    });
    rz.on("payment.failed", (r) => reject(new ShopError(r.error?.description || "The payment failed.", 0, "failed")));
    rz.open();
  });
}

/* ---------- the signed-in customer's wishlist and saved addresses ---------- */

export const accountWishlist = (token: string) => call<{ data: { _id: string; slug: string }[] }>("/customer/me/wishlist", { token });
export const accountWishlistAdd = (token: string, productId: string) => call(`/customer/me/wishlist/${productId}`, { method: "POST", token, body: {} });
export const accountWishlistRemove = (token: string, productId: string) => call(`/customer/me/wishlist/${productId}`, { method: "DELETE", token });
export const accountWishlistMerge = (token: string, productIds: string[]) => call("/customer/me/wishlist/merge", { token, body: { productIds } });

export type AccountAddress = { _id: string; label?: string; type?: string; fullName: string; phone: string; line1: string; line2?: string; landmark?: string; city: string; state: string; country?: string; pincode: string; isDefault?: boolean };
export const accountAddresses = (token: string) => call<{ data: AccountAddress[] }>("/customer/me/addresses", { token });
export const accountProfile = (token: string) => call<{ data: { name?: string; email?: string; phone?: string } }>("/customer/me", { token });

/** Saves a delivery address to the account unless the same one is already there. */
export async function saveAddressToAccount(token: string, a: Omit<AccountAddress, "_id">) {
  const list = (await accountAddresses(token)).data;
  const dup = list.some((x) => x.pincode === a.pincode && x.line1.trim().toLowerCase() === a.line1.trim().toLowerCase());
  if (dup) return;
  await call("/customer/me/addresses", { token, body: { ...a, isDefault: list.length === 0 } });
}
