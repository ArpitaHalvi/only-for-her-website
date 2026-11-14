"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SHIPMENT_LABEL, STATUS_LABEL, fmtDate, type OrderStatus, type TrackingEvent } from "@/lib/account";
import { api } from "@/lib/auth";

/* eslint-disable @next/next/no-img-element */

type Tracked = {
  orderNo: string;
  createdAt: string;
  status: OrderStatus;
  statusHistory: { status: OrderStatus; at: string }[];
  paymentMethod: "razorpay" | "cod";
  items: { name: string; variantName?: string; quantity: number; image?: string }[];
  courierName?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  estimatedDelivery?: string;
  shipmentStatus?: string;
  trackingEvents: TrackingEvent[];
  shippedAt?: string;
  deliveredAt?: string;
  cancelReason?: string;
};

const STEPS = [
  { title: "Order placed", text: "Your order has been confirmed." },
  { title: "Processing", text: "Your jewellery is being prepared for dispatch." },
  { title: "Shipped", text: "The package has been handed over to the courier." },
  { title: "Out for delivery", text: "Your order is on its way." },
  { title: "Delivered", text: "Your order has been delivered." },
];

/** How far along the 5 steps this order is (1-5). */
function progress(o: Tracked): number {
  let n = 1;
  if (o.status === "processing") n = 2;
  if (o.status === "shipped") n = 3;
  if (o.status === "delivered") n = 5;
  if (o.shipmentStatus === "out_for_delivery") n = Math.max(n, 4);
  if (o.shipmentStatus === "delivered") n = 5;
  return n;
}

function stepTime(o: Tracked, i: number): string | undefined {
  const hist = (s: OrderStatus) => o.statusHistory.find((h) => h.status === s)?.at;
  if (i === 0) return o.createdAt;
  if (i === 1) return hist("processing");
  if (i === 2) return o.shippedAt ?? hist("shipped");
  if (i === 3) return o.trackingEvents.find((e) => e.status === "out_for_delivery")?.at;
  return o.deliveredAt ?? hist("delivered");
}

const fmtTime = (d?: string) => (d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "");

export default function TrackOrderView() {
  const [orderNo, setOrderNo] = useState("");
  const [contact, setContact] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Tracked | null>(null);

  useEffect(() => {
    const o = new URLSearchParams(window.location.search).get("order");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (o) setOrderNo(o);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const v: Record<string, string> = {};
    if (!orderNo.trim()) v.orderNo = "Enter your order number, like RW-001042.";
    const c = contact.trim();
    if (!c) v.contact = "Enter the email or mobile number used for the order.";
    else if (!c.includes("@") && c.replace(/\D/g, "").length < 10) v.contact = "Enter a valid email address or 10-digit mobile number.";
    setErrs(v);
    setError("");
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      const r = await api<{ data: Tracked }>("/orders/track", { body: { orderNo: orderNo.trim(), contact: c } });
      setResult(r.data);
    } catch (err) {
      setResult(null);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const stopped = result && ["cancelled", "failed", "returned"].includes(result.status);
  const reached = result ? progress(result) : 0;
  const safeLink = result?.trackingUrl && /^https?:\/\//.test(result.trackingUrl) ? result.trackingUrl : undefined;

  return (
    <div className="page-white">
      <div className="wrap trk">
        <nav aria-label="Breadcrumb" className="crumbs">
          <ol>
            <li><Link href="/">Home</Link></li>
            <li aria-current="page">Track order</li>
          </ol>
        </nav>
        <h1 className="cart-title">Track your order</h1>
        <p className="acct-sub">Enter your order number and the email or mobile number you used when ordering.</p>

        <form className="trk-form" onSubmit={submit} noValidate>
          <label className="f">Order number
            <input name="orderNo" value={orderNo} onChange={(e) => setOrderNo(e.target.value)} placeholder="RW-001042" autoComplete="off" aria-invalid={!!errs.orderNo} />
            {errs.orderNo && <span className="f-err">{errs.orderNo}</span>}
          </label>
          <label className="f">Email or mobile number
            <input name="contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="you@example.com or 98XXXXXXXX" autoComplete="email" aria-invalid={!!errs.contact} />
            {errs.contact && <span className="f-err">{errs.contact}</span>}
          </label>
          <button className="btn btn-wine btn-sq" type="submit" disabled={busy}>{busy ? "Looking up…" : "Track order"}</button>
        </form>

        {error && <p className="auth-alert" role="alert">{error}</p>}

        {result && (
          <section className="trk-result" aria-live="polite" aria-labelledby="trk-h">
            <header className="trk-head">
              <div>
                <p className="eyebrow">Order {result.orderNo}</p>
                <h2 id="trk-h" className="h2">{STATUS_LABEL[result.status]}</h2>
                <p className="acct-sub">Placed on {fmtDate(result.createdAt)}</p>
              </div>
              {result.estimatedDelivery && !stopped && result.status !== "delivered" && (
                <p className="trk-eta"><small>Estimated delivery</small><b>{fmtDate(result.estimatedDelivery)}</b></p>
              )}
            </header>

            {stopped ? (
              <p className="auth-alert" role="status">
                {result.status === "cancelled" && `This order was cancelled${result.cancelReason ? `: ${result.cancelReason}` : "."}`}
                {result.status === "failed" && "The payment for this order did not go through, so it was not placed."}
                {result.status === "returned" && "This order was returned."}
              </p>
            ) : (
              <ol className="steps">
                {STEPS.map((s, i) => {
                  const state = i + 1 < reached ? "done" : i + 1 === reached ? "now" : "todo";
                  const t = stepTime(result, i);
                  return (
                    <li key={s.title} className={state} aria-current={state === "now" ? "step" : undefined}>
                      <span className="dot" aria-hidden="true" />
                      <div>
                        <b>{s.title}</b>
                        <p>{state === "todo" ? "Not yet." : i === 0 && result.status === "pending" ? "We've received your order and are waiting to confirm it." : s.text}</p>
                        {state !== "todo" && t && <small>{fmtTime(t)}</small>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}

            <div className="trk-grid">
              <section className="od-card" aria-labelledby="trk-c">
                <h3 id="trk-c" className="trk-h3">Courier details</h3>
                {result.courierName || result.trackingNumber ? (
                  <dl className="os-facts">
                    {result.courierName && <div><dt>Courier partner</dt><dd>{result.courierName}</dd></div>}
                    {result.trackingNumber && <div><dt>Tracking number</dt><dd>{result.trackingNumber}</dd></div>}
                    {result.shipmentStatus && <div><dt>Latest status</dt><dd>{SHIPMENT_LABEL[result.shipmentStatus] ?? result.shipmentStatus}</dd></div>}
                  </dl>
                ) : (
                  <p className="co-sub">Courier and tracking details appear here once your order ships.</p>
                )}
                {safeLink && (
                  <p className="os-links"><a href={safeLink} target="_blank" rel="noopener noreferrer">Track on the courier&apos;s website</a></p>
                )}
              </section>

              <section className="od-card" aria-labelledby="trk-i">
                <h3 id="trk-i" className="trk-h3">In this order</h3>
                <ul className="trk-items">
                  {result.items.map((it, k) => (
                    <li key={k}>
                      {it.image ? <img src={it.image} alt="" width={48} height={48} className="thumb" /> : <span className="thumb thumb-empty" style={{ width: 48, height: 48 }} aria-hidden="true" />}
                      <span>{it.name}{it.variantName && <small> · {it.variantName}</small>}<small>Qty {it.quantity}</small></span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            {result.trackingEvents.length > 0 && (
              <section className="od-card" aria-labelledby="trk-e">
                <h3 id="trk-e" className="trk-h3">Courier updates</h3>
                <ol className="timeline">
                  {[...result.trackingEvents].reverse().map((ev, k) => (
                    <li key={k}>
                      <b>{SHIPMENT_LABEL[ev.status] ?? ev.status}</b>
                      <small>{[ev.description, ev.location].filter(Boolean).join(" · ")}</small>
                      <small>{fmtTime(ev.at)}</small>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <p className="co-sub">
              Questions about this order? <Link href="/contact">Contact us</Link> with your order number.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
