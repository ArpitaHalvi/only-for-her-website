"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ACTIVE_SHIPMENT, fmtDate, imgUrl, type BackendOrder, type SavedAddress, type WishlistProduct } from "@/lib/account";
import { api } from "@/lib/auth";
import { formatINR } from "@/lib/data";
import { useAccount } from "./AccountShell";
import { OrderRow } from "./AccountBits";

/* eslint-disable @next/next/no-img-element */
export default function AccountDashboard() {
  const { me } = useAccount();
  const [orders, setOrders] = useState<BackendOrder[] | null>(null);
  const [total, setTotal] = useState(0);
  const [wish, setWish] = useState<WishlistProduct[] | null>(null);
  const [addresses, setAddresses] = useState<SavedAddress[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ data: BackendOrder[]; pagination: { total: number } }>("/orders/my?limit=50", { auth: true })
      .then((r) => {
        setOrders(r.data);
        setTotal(r.pagination.total);
      })
      .catch((e: Error) => setError(e.message));
    api<{ data: WishlistProduct[] }>("/customer/me/wishlist", { auth: true })
      .then((r) => setWish(r.data.filter(Boolean)))
      .catch(() => setWish([]));
    api<{ data: SavedAddress[] }>("/customer/me/addresses", { auth: true })
      .then((r) => setAddresses(r.data))
      .catch(() => setAddresses([]));
  }, []);

  const active = orders?.filter((o) => ACTIVE_SHIPMENT.includes(o.status)).length ?? 0;
  const shown = (addresses ?? []).slice().sort((a, b) => Number(b.isDefault) - Number(a.isDefault)).slice(0, 2);

  return (
    <>
      <h1 className="acct-title">Dashboard</h1>
      <p className="acct-sub">Hello{me.name ? `, ${me.name.split(" ")[0]}` : ""}. Here&apos;s everything on your account.</p>
      {error && <p className="auth-alert" role="alert">{error}</p>}

      <ul className="stat-grid">
        <li><b>{orders ? total : "–"}</b><span>Total orders</span></li>
        <li><b>{orders ? active : "–"}</b><span>Active shipments</span></li>
        <li><b>{wish ? wish.length : "–"}</b><span>Wishlist items</span></li>
        <li><b>{addresses ? addresses.length : "–"}</b><span>Saved addresses</span></li>
      </ul>

      <div className="acct-head"><h2>Your details</h2><Link href="/account/profile">Edit</Link></div>
      <dl className="acct-details">
        <div><dt>Name</dt><dd>{me.name || "Not added yet"}</dd></div>
        <div><dt>Email</dt><dd>{me.email || "Not added yet"}</dd></div>
        <div><dt>Mobile</dt><dd>{me.phone || "Not added yet"}</dd></div>
        <div><dt>Member since</dt><dd>{fmtDate(me.createdAt)}</dd></div>
      </dl>

      <div className="acct-head">
        <h2>Recent orders</h2>
        {total > 0 && <Link href="/account/orders">View all</Link>}
      </div>
      {!orders ? (
        <div aria-busy="true" style={{ minHeight: 120 }} />
      ) : orders.length === 0 ? (
        <div className="acct-empty">
          <p>You haven&apos;t placed an order yet.</p>
          <Link href="/shop" className="btn btn-wine btn-sq">Explore jewellery</Link>
        </div>
      ) : (
        <ul className="ord-list">{orders.slice(0, 3).map((o) => <OrderRow key={o._id} o={o} />)}</ul>
      )}

      <div className="acct-head">
        <h2>Saved addresses</h2>
        <Link href="/account/addresses">{addresses && addresses.length > 0 ? "Manage" : "Add an address"}</Link>
      </div>
      {!addresses ? (
        <div aria-busy="true" style={{ minHeight: 80 }} />
      ) : shown.length === 0 ? (
        <div className="acct-empty"><p>No addresses saved yet. Add one to check out faster.</p></div>
      ) : (
        <ul className="addr-mini">
          {shown.map((a) => (
            <li key={a._id} className="od-card">
              <h3>{a.label || "Address"}{a.isDefault && <span className="tag-default">Default</span>}</h3>
              <p>
                <b>{a.fullName}</b><br />
                {a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />
                {a.city}, {a.state} {a.pincode}<br />
                {a.phone}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="acct-head">
        <h2>Wishlist</h2>
        {wish && wish.length > 0 && <Link href="/account/wishlist">View all</Link>}
      </div>
      {!wish ? (
        <div aria-busy="true" style={{ minHeight: 120 }} />
      ) : wish.length === 0 ? (
        <div className="acct-empty">
          <p>Nothing saved yet. Tap the heart on a piece you love.</p>
          <Link href="/shop" className="btn btn-wine btn-sq">Explore jewellery</Link>
        </div>
      ) : (
        <ul className="wish-mini">
          {wish.slice(0, 4).map((p) => {
            const img = imgUrl(p.thumbnail) || imgUrl(p.gallery?.[0]);
            const price = p.salePrice && p.salePrice < p.price ? p.salePrice : p.price;
            return (
              <li key={p._id}>
                <Link href={`/product/${p.slug}`}>
                  <span className="wish-mini-img">{img ? <img src={img} alt={p.name} /> : null}</span>
                  <b>{p.name}</b>
                  <span>{formatINR(price)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="acct-head"><h2>Quick links</h2></div>
      <ul className="quick">
        <li><Link href="/account/orders">Track an order</Link></li>
        <li><Link href="/account/addresses">Manage addresses</Link></li>
        <li><Link href="/account/wishlist">Saved items</Link></li>
        <li><Link href="/shop">Continue shopping</Link></li>
      </ul>
    </>
  );
}
