"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatINR } from "@/lib/data";
import {
  ADDRESS_KEY,
  COUPON_KEY,
  STATES,
  etaText,
  priceLines,
  saveOrder,
  type Address,
  type Order,
} from "@/lib/orders";
import { getToken } from "@/lib/auth";
import {
  ShopError,
  accountAddresses,
  accountProfile,
  ensureSession,
  getQuote,
  payWithRazorpay,
  placeOrder,
  resolveItems,
  saveAddressToAccount,
  verifyPayment,
  type Placed,
  type Quote,
} from "@/lib/shop";
import Pic from "./Pic";
import { useCatalog } from "@/lib/catalog";
import { useStore } from "./StoreProvider";

type Errors = Partial<Record<string, string>>;
type Method = "razorpay" | "cod";

const METHODS: { id: Method; label: string; hint: string }[] = [
  { id: "razorpay", label: "Pay online", hint: "UPI, cards, net banking and wallets" },
  { id: "cod", label: "Cash on delivery", hint: "Pay when your order arrives" },
];

const emptyAddress: Address = { house: "", street: "", landmark: "", city: "", state: "", pin: "", country: "India", type: "Home" };

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

export default function CheckoutView() {
  const router = useRouter();
  const { ready, lines, clearCart } = useStore();
  const { byId } = useCatalog();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [addr, setAddr] = useState<Address>(emptyAddress);
  const [saveAddr, setSaveAddr] = useState(true);
  const [method, setMethod] = useState<Method>("razorpay");
  const [errors, setErrors] = useState<Errors>({});
  const [placing, setPlacing] = useState(false);
  const [notice, setNotice] = useState<{ text: string; signIn?: boolean } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // coupon
  const [couponIn, setCouponIn] = useState("");
  const [coupon, setCoupon] = useState<string | null>(null);
  const [couponMsg, setCouponMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // the server's pricing of this bag
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState("");

  // one key per attempt: a double click or a retry after closing the payment window gets the same order back
  const attempt = useRef<{ sig: string; key: string } | null>(null);

  /* prefill from a saved address and any applied coupon */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ADDRESS_KEY);
      if (raw) {
        const v = JSON.parse(raw);
        setName(v.name ?? "");
        setEmail(v.email ?? "");
        setPhone(v.phone ?? "");
        if (v.addr) setAddr({ ...emptyAddress, ...v.addr });
      }
      const c = localStorage.getItem(COUPON_KEY);
      if (c) {
        setCoupon(c);
        setCouponIn(c);
      }
    } catch {
      /* ignore */
    }
    // signed in: fill the gaps from the account (name, contact details, default address)
    const token = getToken();
    if (token) {
      Promise.all([accountProfile(token), accountAddresses(token)])
        .then(([p, a]) => {
          const me = p.data;
          setName((v) => v || me.name || "");
          setEmail((v) => v || me.email || "");
          setPhone((v) => v || (me.phone ?? "").replace(/\D/g, "").slice(-10));
          const d = a.data.find((x) => x.isDefault) ?? a.data[0];
          if (d) {
            setAddr((cur) =>
              cur.house || cur.pin
                ? cur
                : { ...emptyAddress, house: d.line1, street: d.line2 ?? "", landmark: d.landmark ?? "", city: d.city, state: d.state, pin: d.pincode, country: d.country ?? "India" },
            );
            setPhone((v) => v || d.phone.replace(/\D/g, "").slice(-10));
          }
        })
        .catch(() => {
          /* the form simply starts empty */
        });
    }
  }, []);

  /* what is in the bag, re-read from catalog data rather than trusted from the cart */
  const rows = useMemo(() => priceLines(lines, byId), [lines, byId]);
  const live = rows.filter((r) => !r.gone);
  const blocked = rows.some((r) => r.gone);
  const bagSig = live.map((r) => `${r.line.key}:${r.qty}`).join("|");

  /* ask the server for the real prices, coupon and totals */
  useEffect(() => {
    if (!ready || live.length === 0) return;
    let stale = false;
    const t = setTimeout(async () => {
      try {
        const items = await resolveItems(rows);
        const q = await getQuote(items, { couponCode: coupon, paymentMethod: method, pincode: addr.pin.length === 6 ? addr.pin : undefined });
        if (stale) return;
        setQuote(q);
        setQuoteError("");
        if (coupon) {
          if (q.couponCode) setCouponMsg({ text: `${q.couponCode} applied.`, ok: true });
          else if (q.couponError) {
            setCouponMsg({ text: q.couponError, ok: false });
            setCoupon(null);
            try { localStorage.removeItem(COUPON_KEY); } catch { /* ignore */ }
          }
        }
      } catch (e) {
        if (!stale) setQuoteError(e instanceof Error ? e.message : "We couldn't price your bag.");
      }
    }, 250);
    return () => {
      stale = true;
      clearTimeout(t);
    };
    // rows is derived from lines; bagSig changes when quantities or items change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, bagSig, coupon, method, addr.pin]);

  const applyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    const c = couponIn.trim().toUpperCase();
    if (!c) return;
    setCouponMsg(null);
    setCoupon(c);
    try { localStorage.setItem(COUPON_KEY, c); } catch { /* ignore */ }
  };
  const removeCoupon = () => {
    setCoupon(null);
    setCouponIn("");
    setCouponMsg(null);
    try { localStorage.removeItem(COUPON_KEY); } catch { /* ignore */ }
  };

  const option = (m: Method) => quote?.paymentOptions.find((o) => o.method === m);
  const codOk = option("cod")?.enabled !== false;
  useEffect(() => {
    if (method === "cod" && !codOk) setMethod("razorpay");
  }, [method, codOk]);

  const delivery = quote?.delivery;
  const eta: readonly [number, number] = [delivery?.minDays ?? 4, delivery?.maxDays ?? delivery?.minDays ?? 6];

  const setA = (k: keyof Address, v: string) => setAddr((a) => ({ ...a, [k]: v }));

  const validate = (): Errors => {
    const e: Errors = {};
    if (name.trim().length < 2) e.name = "Enter your full name.";
    if (!/^\S+@\S+\.\S+$/.test(email)) e.email = "Enter a valid email address.";
    if (!/^[6-9]\d{9}$/.test(phone)) e.phone = "Enter a valid 10-digit mobile number.";
    if (!addr.house.trim()) e.house = "Enter your house or flat number.";
    if (!addr.street.trim()) e.street = "Enter your street or locality.";
    if (!addr.city.trim()) e.city = "Enter your city.";
    if (!addr.state) e.state = "Select your state.";
    if (!/^[1-9]\d{5}$/.test(addr.pin)) e.pin = "Enter a valid 6-digit PIN code.";
    else if (delivery && delivery.valid && !delivery.serviceable) e.pin = delivery.message ?? "We don't deliver to this PIN code yet.";
    return e;
  };

  /** The order is in: remember it for the confirmation page and empty the bag. */
  const finish = (placed: Placed, paid: boolean, paymentId?: string) => {
    const q = quote;
    const order: Order = {
      number: placed.orderNo,
      txn: paymentId ?? placed.orderNo,
      createdAt: new Date().toISOString(),
      status: paid ? "paid" : "pending",
      method: placed.paymentMethod === "cod" ? "Cash on delivery" : "Online payment",
      customer: { name: name.trim(), email: email.trim(), phone },
      address: addr,
      shipping: { label: "Standard delivery", eta: etaText(eta), fee: q?.shippingCharge ?? 0 },
      items: live.map((r) => ({ name: r.name, href: r.href, tone: r.tone, kind: r.kind, image: r.image, variantName: r.variantName, qty: r.qty, price: r.price })),
      totals: {
        mrpTotal: live.reduce((a, r) => a + (r.mrp ?? r.price) * r.qty, 0),
        discount: live.reduce((a, r) => a + ((r.mrp ?? r.price) - r.price) * r.qty, 0),
        couponOff: q?.discount ?? 0,
        afterDiscount: (q?.subtotal ?? 0) - (q?.discount ?? 0),
        shipping: q?.shippingCharge ?? 0,
        codFee: q?.codCharge ?? 0,
        total: placed.totalAmount,
      },
    };
    saveOrder(order);
    const token = getToken();
    if (saveAddr && token) {
      saveAddressToAccount(token, {
        type: addr.type === "Office" ? "office" : addr.type === "Other" ? "other" : "home",
        label: addr.type,
        fullName: name.trim(),
        phone,
        line1: addr.house.trim(),
        line2: addr.street.trim() || undefined,
        landmark: addr.landmark.trim() || undefined,
        city: addr.city.trim(),
        state: addr.state,
        country: addr.country,
        pincode: addr.pin,
      }).catch(() => {
        /* the order is placed; saving the address is a convenience */
      });
    }
    attempt.current = null;
    clearCart();
    try { localStorage.removeItem(COUPON_KEY); } catch { /* ignore */ }
    router.push("/order-success");
  };

  const place = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (placing || live.length === 0 || blocked) return;
    const e = validate();
    setErrors(e);
    const first = Object.keys(e)[0];
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    if (saveAddr) {
      try { localStorage.setItem(ADDRESS_KEY, JSON.stringify({ name, email, phone, addr })); } catch { /* ignore */ }
    }

    setPlacing(true);
    setNotice(null);
    try {
      const items = await resolveItems(rows);
      const session = await ensureSession({ name: name.trim(), email: email.trim(), phone });

      // same bag + coupon + method => same key => the server hands back the same order
      const sig = `${bagSig}#${coupon ?? ""}#${method}#${addr.pin}`;
      if (!attempt.current || attempt.current.sig !== sig) attempt.current = { sig, key: newKey() };

      const placed = await placeOrder(session.token, {
        items,
        paymentMethod: method,
        couponCode: coupon,
        idempotencyKey: attempt.current.key,
        shippingAddress: {
          fullName: name.trim(),
          phone,
          line1: addr.house.trim(),
          line2: addr.street.trim(),
          landmark: addr.landmark.trim() || undefined,
          city: addr.city.trim(),
          state: addr.state,
          country: addr.country,
          pincode: addr.pin,
        },
      });

      if (placed.paymentMethod === "cod") {
        finish(placed, false);
        return;
      }

      try {
        const proof = await payWithRazorpay(placed, { name: name.trim(), email: email.trim(), phone });
        await verifyPayment(session.token, {
          orderId: placed.orderId,
          razorpayOrderId: proof.razorpay_order_id,
          razorpayPaymentId: proof.razorpay_payment_id,
          razorpaySignature: proof.razorpay_signature,
        });
        finish(placed, true, proof.razorpay_payment_id);
      } catch (pe) {
        if (pe instanceof ShopError && (pe.code === "dismissed" || pe.code === "failed")) {
          setNotice({ text: `${pe.code === "failed" ? pe.message : "The payment window was closed before paying."} Your order ${placed.orderNo} is saved. Press Pay to try again.` });
        } else {
          setNotice({ text: `We couldn't confirm your payment (${pe instanceof Error ? pe.message : "unknown error"}). If any money was taken, it will be matched to order ${placed.orderNo}. Please contact us before paying again.` });
        }
      }
    } catch (err) {
      if (err instanceof ShopError && err.code === "ACCOUNT_EXISTS") setNotice({ text: err.message, signIn: true });
      else setNotice({ text: err instanceof Error ? err.message : "We couldn't place your order. Please try again." });
    } finally {
      setPlacing(false);
    }
  };

  if (!ready) return <div className="checkout-page"><div className="wrap" aria-busy="true" style={{ minHeight: 400 }} /></div>;

  if (lines.length === 0) {
    return (
      <div className="checkout-page page-white">
        <div className="wrap wl-empty">
          <h1 className="h3">Your bag is empty</h1>
          <p>Add a piece or two before checking out.</p>
          <Link href="/shop" className="btn btn-wine btn-sq">Explore jewellery</Link>
        </div>
      </div>
    );
  }

  const err = (k: string) => (errors[k] ? <p className="f-err" id={`e-${k}`}>{errors[k]}</p> : null);
  const aria = (k: string) => ({ "aria-invalid": !!errors[k], "aria-describedby": errors[k] ? `e-${k}` : undefined, name: k });
  const total = quote?.totalAmount;

  return (
    <div className="checkout-page page-white">
      <div className="wrap co">
        <Link href="/cart" className="back-link">← Back to cart</Link>
        <h1 className="cart-title">Checkout</h1>

        <form ref={formRef} onSubmit={place} noValidate className="co-grid">
          <div className="co-steps">
            {/* 1 */}
            <section className="co-card" aria-labelledby="s1">
              <h2 id="s1"><span>1</span> Customer information</h2>
              <p className="co-sub">Checking out as a guest. No account needed.</p>
              <div className="f-grid">
                <label className="f full">Full name
                  <input {...aria("name")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                  {err("name")}
                </label>
                <label className="f">Email address
                  <input {...aria("email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                  {err("email")}
                </label>
                <label className="f">Mobile number
                  <input {...aria("phone")} inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} autoComplete="tel-national" placeholder="10-digit number" />
                  {err("phone")}
                </label>
              </div>
            </section>

            {/* 2 */}
            <section className="co-card" aria-labelledby="s2">
              <h2 id="s2"><span>2</span> Delivery address</h2>
              <div className="f-grid">
                <label className="f">House / flat number
                  <input {...aria("house")} value={addr.house} onChange={(e) => setA("house", e.target.value)} autoComplete="address-line1" />
                  {err("house")}
                </label>
                <label className="f">Street / locality
                  <input {...aria("street")} value={addr.street} onChange={(e) => setA("street", e.target.value)} autoComplete="address-line2" />
                  {err("street")}
                </label>
                <label className="f full">Landmark (optional)
                  <input name="landmark" value={addr.landmark} onChange={(e) => setA("landmark", e.target.value)} />
                </label>
                <label className="f">City
                  <input {...aria("city")} value={addr.city} onChange={(e) => setA("city", e.target.value)} autoComplete="address-level2" />
                  {err("city")}
                </label>
                <label className="f">State
                  <select {...aria("state")} value={addr.state} onChange={(e) => setA("state", e.target.value)} autoComplete="address-level1">
                    <option value="">Select state</option>
                    {STATES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                  {err("state")}
                </label>
                <label className="f">PIN code
                  <input {...aria("pin")} inputMode="numeric" maxLength={6} value={addr.pin} onChange={(e) => setA("pin", e.target.value.replace(/\D/g, ""))} autoComplete="postal-code" />
                  {err("pin")}
                  {!errors.pin && delivery && delivery.valid && !delivery.serviceable && <p className="f-err">{delivery.message ?? "We don't deliver to this PIN code yet."}</p>}
                </label>
                <label className="f">Country
                  <select name="country" value={addr.country} onChange={(e) => setA("country", e.target.value)}>
                    <option>India</option>
                  </select>
                </label>
              </div>
              <fieldset className="seg">
                <legend>Address type</legend>
                {(["Home", "Office", "Other"] as const).map((t) => (
                  <label key={t} className={addr.type === t ? "on" : ""}>
                    <input type="radio" name="addrType" checked={addr.type === t} onChange={() => setA("type", t)} /> {t}
                  </label>
                ))}
              </fieldset>
              <label className="inline-check">
                <input type="checkbox" checked={saveAddr} onChange={(e) => setSaveAddr(e.target.checked)} />
                Save this address on this device for next time
              </label>
            </section>

            {/* 3 */}
            <section className="co-card" aria-labelledby="s3">
              <h2 id="s3"><span>3</span> Delivery</h2>
              <ul className="choice">
                <li>
                  <label className="on">
                    <input type="radio" name="ship" checked readOnly />
                    <span>
                      <b>Standard delivery</b>
                      <small>Estimated delivery {etaText(eta)}</small>
                    </span>
                    <em>{quote ? (quote.shippingCharge === 0 ? "Free" : formatINR(quote.shippingCharge)) : "…"}</em>
                  </label>
                </li>
              </ul>
            </section>

            {/* 4 */}
            <section className="co-card" aria-labelledby="s4">
              <h2 id="s4"><span>4</span> Payment method</h2>
              <ul className="choice">
                {METHODS.map((m) => {
                  const o = option(m.id);
                  const disabled = o?.enabled === false;
                  return (
                    <li key={m.id}>
                      <label className={`${method === m.id ? "on" : ""}${disabled ? " dis" : ""}`}>
                        <input type="radio" name="pay" disabled={disabled} checked={method === m.id} onChange={() => setMethod(m.id)} />
                        <span>
                          <b>{m.label}</b>
                          <small>{disabled ? (o?.reason ?? "Not available") : m.hint}</small>
                        </span>
                        {m.id === "cod" && (o?.fee ?? 0) > 0 && <em>+{formatINR(o!.fee)}</em>}
                      </label>
                    </li>
                  );
                })}
              </ul>
              {method === "razorpay" && (
                <p className="co-sub">You&apos;ll enter your payment details securely in our payment partner&apos;s window. We never see or store them.</p>
              )}
            </section>

            {/* 5 */}
            <section className="co-card" aria-labelledby="s5">
              <h2 id="s5"><span>5</span> Order review</h2>
              {blocked && (
                <p className="cart-alert" role="alert">
                  Some items are no longer available. <Link href="/cart">Update your cart</Link> to continue.
                </p>
              )}
              <ul className="rev-list">
                {rows.map((r) => (
                  <li key={r.line.key} className={r.gone ? "gone" : ""}>
                    <span className="rev-img"><Pic src={r.image} kind={r.kind} tone={r.tone} className="fill" /></span>
                    <span className="rev-info">
                      <b>{r.name}</b>
                      {r.variantName && <small>{r.variantName}</small>}
                      <small>{r.gone ? "Out of stock" : `Qty ${r.qty}`}</small>
                    </span>
                    <span>{r.gone ? "" : formatINR(r.price * r.qty)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* 6 */}
          <aside className="summary" aria-label="Order total">
            <h2>Order total</h2>

            <div className="coupon-box">
              <label className="sr-only" htmlFor="co-coupon">Coupon code</label>
              <div className="coupon">
                <input id="co-coupon" value={couponIn} onChange={(e) => setCouponIn(e.target.value)} placeholder="Coupon code" autoCapitalize="characters" disabled={!!quote?.couponCode} />
                {quote?.couponCode ? (
                  <button type="button" className="btn btn-outline btn-sq" onClick={removeCoupon}>Remove</button>
                ) : (
                  <button type="button" className="btn btn-outline btn-sq" onClick={applyCoupon}>Apply</button>
                )}
              </div>
              {couponMsg && <p className={`coupon-msg${couponMsg.ok ? " ok" : ""}`} role="status">{couponMsg.text}</p>}
            </div>

            {quoteError && <p className="cart-alert" role="alert">{quoteError}</p>}
            <dl className="sum-rows">
              <div><dt>Subtotal</dt><dd>{quote ? formatINR(quote.subtotal) : "…"}</dd></div>
              {quote && quote.discount > 0 && <div><dt>Coupon ({quote.couponCode})</dt><dd>−{formatINR(quote.discount)}</dd></div>}
              <div><dt>Shipping</dt><dd>{quote ? (quote.shippingCharge === 0 ? "Free" : formatINR(quote.shippingCharge)) : "…"}</dd></div>
              {quote && quote.codCharge > 0 && <div><dt>Cash on delivery fee</dt><dd>{formatINR(quote.codCharge)}</dd></div>}
              {quote && quote.giftWrapCharge > 0 && <div><dt>Gift wrapping</dt><dd>{formatINR(quote.giftWrapCharge)}</dd></div>}
              <div><dt>Taxes</dt><dd>{quote && quote.tax > 0 ? (quote.taxMode === "inclusive" ? `Included (${formatINR(quote.tax)})` : formatINR(quote.tax)) : "Included"}</dd></div>
              <div className="sum-total"><dt>Total payable</dt><dd>{total !== undefined ? formatINR(total) : "…"}</dd></div>
            </dl>

            {notice && (
              <p className="cart-alert" role="alert">
                {notice.text} {notice.signIn && <Link href="/auth">Sign in</Link>}
              </p>
            )}
            <button className="btn btn-wine btn-sq checkout" type="submit" disabled={placing || blocked || live.length === 0 || !quote}>
              {placing ? "Placing your order…" : method === "cod" ? "Place order" : total !== undefined ? `Pay ${formatINR(total)}` : "Pay"}
            </button>
            <p className="sum-note center-t">
              By placing your order you agree to our <Link href="/terms">Terms</Link> and <Link href="/privacy-policy">Privacy Policy</Link>.
            </p>
          </aside>
        </form>
      </div>
    </div>
  );
}
