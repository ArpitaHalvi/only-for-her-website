"use client";

import Link from "next/link";
import { useState } from "react";
import { formatINR } from "@/lib/data";
import { PAYMENT_LABEL, SHIPMENT_LABEL, STATUS_LABEL, fmtDate, itemImage, type BackendOrder, type OrderItem } from "@/lib/account";

/* eslint-disable @next/next/no-img-element */
export function Thumb({ item, size = 64 }: { item: OrderItem; size?: number }) {
  const src = itemImage(item);
  const [bad, setBad] = useState(false);
  return src && !bad ? (
    <img src={src} alt={item.name} width={size} height={size} className="thumb" onError={() => setBad(true)} />
  ) : (
    <span className="thumb thumb-empty" style={{ width: size, height: size }} aria-hidden="true" />
  );
}

export const PaymentPill = ({ status }: { status: string }) => (
  <span className={`pill-status st-${status}`}>{PAYMENT_LABEL[status as keyof typeof PAYMENT_LABEL] ?? status}</span>
);
export const ShipmentPill = ({ status }: { status: string }) => (
  <span className={`pill-status st-${status}`}>{SHIPMENT_LABEL[status] ?? status}</span>
);
export const StatusPill = ({ status }: { status: string }) => (
  <span className={`pill-status st-${status}`}>{STATUS_LABEL[status as keyof typeof STATUS_LABEL] ?? status}</span>
);

export function OrderRow({ o }: { o: BackendOrder }) {
  const first = o.items[0];
  const more = o.items.length - 1;
  return (
    <li className="ord-row">
      <div className="ord-thumbs">
        {first && <Thumb item={first} />}
        {more > 0 && <small>+{more} more</small>}
      </div>
      <div className="ord-meta">
        <b>{o.orderNo}</b>
        <small>{fmtDate(o.createdAt)}</small>
        <small>{first?.name}{more > 0 ? ` and ${more} more` : ""}</small>
      </div>
      <div className="ord-state">
        <StatusPill status={o.status} />
        <span className="pay-line">Payment: <PaymentPill status={o.paymentStatus} /></span>
      </div>
      <p className="ord-total">{formatINR(o.totalAmount)}</p>
      <Link href={`/account/orders/details?id=${o._id}`} className="btn btn-outline btn-sq ord-view">View details</Link>
    </li>
  );
}
