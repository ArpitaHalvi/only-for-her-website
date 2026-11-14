"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatINR } from "@/lib/data";
import { loadLastOrder, type Order } from "@/lib/orders";
import Pic from "./Pic";
import { CheckIcon, CloseIcon } from "./Icons";

const STATUS: Record<Order["status"], string> = {
  paid: "Paid",
  pending: "Pay on delivery",
  failed: "Payment failed",
};

export default function OrderSuccessView() {
  const [order, setOrder] = useState<Order | null | undefined>(undefined);

  useEffect(() => setOrder(loadLastOrder()), []);

  if (order === undefined) return <div className="page-white"><div className="wrap" style={{ minHeight: 400 }} aria-busy="true" /></div>;

  if (order === null) {
    return (
      <div className="page-white">
        <div className="wrap wl-empty">
          <h1 className="h3">No recent order found</h1>
          <p>Your confirmation email has the details of any order you have placed. You can also track an order with its order number.</p>
          <Link href="/track-order" className="btn btn-wine btn-sq">Track an order</Link>
        </div>
      </div>
    );
  }

  const failed = order.status === "failed";
  const a = order.address;

  return (
    <div className="page-white">
      <div className="wrap os">
        <header className={`os-head${failed ? " fail" : ""}`}>
          <span className="os-icon" aria-hidden="true">{failed ? <CloseIcon /> : <CheckIcon />}</span>
          <h1 className="h2">{failed ? "Payment didn't go through" : "Thank you, your order is placed"}</h1>
          <p>
            {failed
              ? "Your bag is saved and nothing has been charged. If money was debited, it is usually returned to your account within 5-7 working days."
              : `A confirmation will be sent to ${order.customer.email}.`}
          </p>
          <div className="os-cta">
            {failed ? (
              <>
                <Link href="/checkout" className="btn btn-wine btn-sq">Try payment again</Link>
                <Link href="/cart" className="btn btn-outline btn-sq">Back to cart</Link>
              </>
            ) : (
              <>
                <Link href="/track-order" className="btn btn-wine btn-sq">Track order</Link>
                <Link href="/shop" className="btn btn-outline btn-sq">Continue shopping</Link>
              </>
            )}
          </div>
        </header>

        <div className="os-grid">
          <section className="co-card" aria-labelledby="os-d">
            <h2 id="os-d">Order details</h2>
            <dl className="os-facts">
              <div><dt>Order number</dt><dd>{order.number}</dd></div>
              <div><dt>Payment status</dt><dd><span className={`pill-status ${order.status}`}>{STATUS[order.status]}</span></dd></div>
              <div><dt>Payment method</dt><dd>{order.method}</dd></div>
              <div><dt>Transaction reference</dt><dd>{failed ? "Not generated" : order.txn}</dd></div>
              <div><dt>Placed on</dt><dd>{new Date(order.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</dd></div>
              {!failed && <div><dt>Expected delivery</dt><dd>{order.shipping.eta} ({order.shipping.label})</dd></div>}
            </dl>
            {!failed && (
              <p className="os-links">
                <Link href="/account/orders">View order details</Link>
                <span className="muted">Invoice available after your order ships</span>
              </p>
            )}
          </section>

          <section className="co-card" aria-labelledby="os-a">
            <h2 id="os-a">Delivery address</h2>
            <address className="os-addr">
              <b>{order.customer.name}</b>
              <br />
              {a.house}, {a.street}
              {a.landmark && <>, near {a.landmark}</>}
              <br />
              {a.city}, {a.state} {a.pin}
              <br />
              {a.country} · {a.type}
              <br />
              {order.customer.phone}
            </address>
          </section>

          <section className="co-card os-wide" aria-labelledby="os-s">
            <h2 id="os-s">Order summary</h2>
            <ul className="rev-list">
              {order.items.map((it, k) => (
                <li key={it.name + k}>
                  <span className="rev-img"><Pic src={it.image} kind={it.kind} tone={it.tone} className="fill" /></span>
                  <span className="rev-info">
                    <b>{it.name}</b>
                    {it.variantName && <small>{it.variantName}</small>}
                    <small>Qty {it.qty}</small>
                  </span>
                  <span>{formatINR(it.price * it.qty)}</span>
                </li>
              ))}
            </ul>
            <dl className="sum-rows">
              <div><dt>Subtotal</dt><dd>{formatINR(order.totals.mrpTotal)}</dd></div>
              {order.totals.discount > 0 && <div><dt>Discount</dt><dd>−{formatINR(order.totals.discount)}</dd></div>}
              {order.totals.couponOff > 0 && <div><dt>Coupon</dt><dd>−{formatINR(order.totals.couponOff)}</dd></div>}
              <div><dt>Shipping</dt><dd>{order.totals.shipping === 0 ? "Free" : formatINR(order.totals.shipping)}</dd></div>
              <div className="sum-total"><dt>{failed ? "Amount due" : "Total"}</dt><dd>{formatINR(order.totals.total)}</dd></div>
            </dl>
          </section>
        </div>

      </div>
    </div>
  );
}
