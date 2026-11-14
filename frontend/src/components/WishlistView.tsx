"use client";

import Link from "next/link";
import { useState } from "react";
import { useCatalog } from "@/lib/catalog";
import { formatINR } from "@/lib/data";
import Pic from "./Pic";
import { useStore } from "./StoreProvider";
import { HeartIcon } from "./Icons";

export default function WishlistView() {
  const { ready, wishItems, removeWish, addToCart } = useStore();
  const { byId } = useCatalog();
  const [note, setNote] = useState("");

  const rows = wishItems
    .map((w) => ({ w, p: byId(w.id) }))
    .filter((r): r is { w: typeof r.w; p: NonNullable<typeof r.p> } => !!r.p);

  const flash = (m: string) => {
    setNote(m);
    setTimeout(() => setNote(""), 2400);
  };

  const share = async () => {
    const text = rows.map((r) => `${r.p.name}: ${window.location.origin}${r.p.href}`).join("\n");
    try {
      if (navigator.share) await navigator.share({ title: "My Only For Her wishlist", text });
      else {
        await navigator.clipboard.writeText(text);
        flash("Wishlist links copied");
      }
    } catch {
      /* cancelled */
    }
  };

  return (
    <div className="page-white">
      <div className="wrap wl">
        <header className="wl-head">
          <div>
            <h1 className="wl-title">My Wishlist</h1>
            {ready && rows.length > 0 && (
              <p className="wl-count"><b>{rows.length}</b> {rows.length === 1 ? "item" : "items"} saved</p>
            )}
          </div>
          {rows.length > 0 && (
            <div className="wl-actions">
              <span className="pdp-note" role="status">{note}</span>
              <button className="btn btn-outline btn-sq" onClick={share}>Share wishlist</button>
            </div>
          )}
        </header>

        {!ready ? (
          <div aria-busy="true" style={{ minHeight: 240 }} />
        ) : rows.length === 0 ? (
          <div className="wl-empty">
            <HeartIcon className="wl-heart" />
            <h2 className="h3">Your wishlist is empty</h2>
            <p>Tap the heart on any piece you love and it will wait for you here.</p>
            <Link href="/shop" className="btn btn-wine btn-sq">Explore jewellery</Link>
          </div>
        ) : (
          <ul className="wl-grid">
            {rows.map(({ w, p }) => {
              const out = p.inStock === false;
              const dropped = p.price < w.savedPrice;
              const rose = p.price > w.savedPrice;
              return (
                <li key={p.id} className="wl-card">
                  <div className="wl-photo">
                    <Link href={p.href} aria-label={p.name} tabIndex={-1}>
                      <Pic src={p.image} alt={p.name} kind={p.kind} tone={p.tone} className="fill" />
                    </Link>
                    {out ? (
                      <span className="badge badge-out">Out of stock</span>
                    ) : p.original ? (
                      <span className="badge badge-sale">Sale</span>
                    ) : p.badge === "New" ? (
                      <span className="badge badge-dark">New</span>
                    ) : null}
                    <button className="wl-heart-btn" onClick={() => removeWish(p.id)} aria-label={`Remove ${p.name} from wishlist`}>
                      <HeartIcon filled />
                    </button>
                  </div>
                  <p className="wl-cat">{p.category}</p>
                  <h2 className="wl-name"><Link href={p.href}>{p.name}</Link></h2>
                  <p className="price">
                    <strong>{formatINR(p.price)}</strong>
                    {p.original && <s>{formatINR(p.original)}</s>}
                  </p>
                  {dropped && <p className="wl-flag good">Price dropped from {formatINR(w.savedPrice)}</p>}
                  {rose && <p className="wl-flag">Price changed from {formatINR(w.savedPrice)}</p>}
                  {!out && <p className="pdp-stock">In stock</p>}
                  <button
                    className="btn btn-wine btn-sq wl-move"
                    disabled={out}
                    onClick={() => {
                      addToCart(p.id);
                      removeWish(p.id);
                      flash(`${p.name} moved to your bag`);
                    }}
                  >
                    {out ? "Sold out" : "Move to cart"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="fine-dark wl-foot">
          Your wishlist is saved on this device. <Link href="/account">Sign in</Link> to keep it across devices.
        </p>
      </div>
    </div>
  );
}
