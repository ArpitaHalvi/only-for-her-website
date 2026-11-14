"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { imgUrl, type WishlistProduct } from "@/lib/account";
import { api } from "@/lib/auth";
import { formatINR } from "@/lib/data";

/* eslint-disable @next/next/no-img-element */
export default function AccountWishlist() {
  const [items, setItems] = useState<WishlistProduct[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ data: WishlistProduct[] }>("/customer/me/wishlist", { auth: true })
      .then((r) => setItems(r.data.filter(Boolean)))
      .catch((e: Error) => setError(e.message));
  }, []);

  const remove = async (id: string) => {
    try {
      await api(`/customer/me/wishlist/${id}`, { method: "DELETE", auth: true });
      setItems((l) => l?.filter((p) => p._id !== id) ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <h1 className="acct-title">My Wishlist</h1>
      {error && <p className="auth-alert" role="alert">{error}</p>}
      {!items && !error ? (
        <div aria-busy="true" style={{ minHeight: 200 }} />
      ) : items && items.length === 0 ? (
        <div className="acct-empty">
          <p>Nothing saved yet. Tap the heart on a piece you love.</p>
          <Link href="/shop" className="btn btn-wine btn-sq">Explore jewellery</Link>
        </div>
      ) : (
        items && (
          <ul className="wl-grid acct-wl">
            {items.map((p) => {
              const img = imgUrl(p.thumbnail) || imgUrl(p.gallery?.[0]);
              const price = p.salePrice && p.salePrice < p.price ? p.salePrice : p.price;
              const out = p.stock !== undefined && p.stock <= 0;
              return (
                <li key={p._id} className="wl-card">
                  <div className="wl-photo">
                    <Link href={`/product/${p.slug}`} aria-label={p.name}>
                      {img ? <img src={img} alt={p.name} className="fill" style={{ objectFit: "cover" }} /> : <span className="fill thumb-empty" />}
                    </Link>
                    {out && <span className="badge badge-out">Out of stock</span>}
                  </div>
                  <h2 className="wl-name"><Link href={`/product/${p.slug}`}>{p.name}</Link></h2>
                  <p className="price">
                    <strong>{formatINR(price)}</strong>
                    {price < p.price && <s>{formatINR(p.price)}</s>}
                  </p>
                  <button className="link-btn" onClick={() => remove(p._id)}>Remove</button>
                </li>
              );
            })}
          </ul>
        )
      )}
    </>
  );
}
