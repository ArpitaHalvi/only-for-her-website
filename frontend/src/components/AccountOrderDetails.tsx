"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SHIPMENT_LABEL, canCancel, downloadPdf, fmtDate, type BackendOrder } from "@/lib/account";
import { api } from "@/lib/auth";
import { formatINR } from "@/lib/data";
import { PaymentPill, ShipmentPill, StatusPill, Thumb } from "./AccountBits";

export default function AccountOrderDetails() {
  const [order, setOrder] = useState<BackendOrder | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("No order selected.");
      return;
    }
    api<{ data: BackendOrder }>(`/orders/my/${id}`, { auth: true })
      .then((r) => setOrder(r.data))
      .catch((e: Error) => setError(e.message));
  }, []);

  const download = async (kind: "invoice" | "receipt") => {
    if (!order) return;
    setNote("");
    try {
      await downloadPdf(`/orders/my/${order._id}/${kind}`, `${kind}-${order.orderNo}.pdf`);
    } catch (e) {
      setNote((e as Error).message);
    }
  };

  const cancel = async () => {
    if (!order || busy) return;
    setBusy(true);
    setNote("");
    try {
      const r = await api<{ message: string; data: BackendOrder }>(`/orders/my/${order._id}/cancel`, {
        method: "PATCH",
        auth: true,
        body: { reason: reason.trim() || undefined },
      });
      setOrder({ ...order, ...r.data });
      setNote(r.message);
      setCancelling(false);
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (error)
    return (
      <>
        <p className="auth-alert" role="alert">{error}</p>
        <Link href="/account/orders">Back to my orders</Link>
      </>
    );
  if (!order) return <div aria-busy="true" style={{ minHeight: 300 }} />;

  const a = order.shippingAddress;
  const hasTracking = order.trackingNumber || order.trackingEvents.length > 0 || order.courierName;

  return (
    <>
      <Link href="/account/orders" className="back-link">← My orders</Link>
      <div className="od-head">
        <div>
          <h1 className="acct-title">Order {order.orderNo}</h1>
          <p className="acct-sub">Placed on {fmtDate(order.createdAt)}</p>
        </div>
        <StatusPill status={order.status} />
      </div>
      {note && <p className="pdp-note" role="status">{note}</p>}

      <section className="od-card" aria-labelledby="od-items">
        <h2 id="od-items">Items</h2>
        <ul className="rev-list">
          {order.items.map((it, k) => (
            <li key={k}>
              <Thumb item={it} />
              <span className="rev-info">
                <b>{it.product?.slug ? <Link href={`/product/${it.product.slug}`}>{it.name}</Link> : it.name}</b>
                {it.variantName && <small>{it.variantName}</small>}
                {it.attributes && Object.entries(it.attributes).map(([k2, v]) => <small key={k2}>{k2}: {v}</small>)}
                <small>Qty {it.quantity} × {formatINR(it.price)}</small>
              </span>
              <span>{formatINR(it.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="sum-rows">
          <div><dt>Subtotal</dt><dd>{formatINR(order.subtotal)}</dd></div>
          {order.discount > 0 && <div><dt>Discount{order.couponCode ? ` (${order.couponCode})` : ""}</dt><dd>−{formatINR(order.discount)}</dd></div>}
          <div><dt>Shipping</dt><dd>{order.shippingCharge === 0 ? "Free" : formatINR(order.shippingCharge)}</dd></div>
          {order.codCharge > 0 && <div><dt>Cash on delivery fee</dt><dd>{formatINR(order.codCharge)}</dd></div>}
          {order.tax > 0 && <div><dt>Tax ({order.taxMode})</dt><dd>{formatINR(order.tax)}</dd></div>}
          <div className="sum-total"><dt>Total</dt><dd>{formatINR(order.totalAmount)}</dd></div>
        </dl>
      </section>

      <div className="od-two">
        <section className="od-card" aria-labelledby="od-addr">
          <h2 id="od-addr">Delivery address</h2>
          <address className="os-addr">
            <b>{a.fullName}</b><br />
            {a.line1}{a.line2 && `, ${a.line2}`}{a.landmark && `, near ${a.landmark}`}<br />
            {a.city}, {a.state} {a.pincode}<br />
            {a.country ?? "India"}<br />
            {a.phone}
          </address>
        </section>

        <section className="od-card" aria-labelledby="od-pay">
          <h2 id="od-pay">Payment</h2>
          <dl className="os-facts">
            <div><dt>Method</dt><dd>{order.paymentMethod === "cod" ? "Cash on delivery" : "Online payment"}</dd></div>
            <div><dt>Status</dt><dd><PaymentPill status={order.paymentStatus} /></dd></div>
            {order.paymentId && <div><dt>Payment ID</dt><dd>{order.paymentId}</dd></div>}
            {order.paidAt && <div><dt>Paid on</dt><dd>{fmtDate(order.paidAt)}</dd></div>}
          </dl>
          {order.refundRequired && <p className="co-sub">A refund for this order is being processed.</p>}
        </section>
      </div>

      <section className="od-card" aria-labelledby="od-track">
        <h2 id="od-track">Shipment tracking</h2>
        {!hasTracking ? (
          <p className="co-sub">
            {["cancelled", "failed", "returned"].includes(order.status)
              ? "There is no shipment for this order."
              : "Tracking details will appear here once your order ships."}
          </p>
        ) : (
          <>
            <dl className="os-facts">
              {order.courierName && <div><dt>Courier</dt><dd>{order.courierName}</dd></div>}
              {order.trackingNumber && <div><dt>Tracking number</dt><dd>{order.trackingNumber}</dd></div>}
              {order.shipmentStatus && <div><dt>Shipment status</dt><dd><ShipmentPill status={order.shipmentStatus} /></dd></div>}
              {order.estimatedDelivery && <div><dt>Estimated delivery</dt><dd>{fmtDate(order.estimatedDelivery)}</dd></div>}
            </dl>
            {order.trackingUrl && /^https?:\/\//.test(order.trackingUrl) && (
              <p className="os-links"><a href={order.trackingUrl} target="_blank" rel="noopener noreferrer">Track on the courier&apos;s site</a></p>
            )}
            {order.trackingEvents.length > 0 && (
              <ol className="timeline">
                {[...order.trackingEvents].reverse().map((ev, k) => (
                  <li key={k}>
                    <b>{SHIPMENT_LABEL[ev.status] ?? ev.status}</b>
                    <small>{[ev.description, ev.location].filter(Boolean).join(" · ")}</small>
                    <small>{new Date(ev.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</small>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </section>

      <section className="od-card" aria-labelledby="od-act">
        <h2 id="od-act">Invoice and help</h2>
        <div className="od-actions">
          {order.invoice?.number ? (
            <button className="btn btn-outline btn-sq" onClick={() => download("invoice")}>Download invoice</button>
          ) : (
            <span className="muted">Your invoice is issued when the order ships.</span>
          )}
          {order.paymentStatus === "paid" && <button className="btn btn-outline btn-sq" onClick={() => download("receipt")}>Download receipt</button>}
          {canCancel(order) && !cancelling && <button className="btn btn-outline btn-sq" onClick={() => setCancelling(true)}>Cancel order</button>}
          {order.status === "delivered" && <Link href="/account/support" className="btn btn-outline btn-sq">Request return or exchange</Link>}
        </div>

        {cancelling && (
          <div className="cancel-box">
            <label className="af">Reason for cancelling (optional)
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
            </label>
            <div className="od-actions">
              <button className="btn btn-wine btn-sq" disabled={busy} onClick={cancel}>{busy ? "Cancelling…" : "Confirm cancellation"}</button>
              <button className="btn btn-outline btn-sq" disabled={busy} onClick={() => setCancelling(false)}>Keep my order</button>
            </div>
          </div>
        )}
        {!canCancel(order) && !["cancelled", "failed", "returned", "delivered"].includes(order.status) && (
          <p className="co-sub">This order is already being prepared, so it can no longer be cancelled online.</p>
        )}
      </section>
    </>
  );
}
