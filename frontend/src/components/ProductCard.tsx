"use client";

import Link from "next/link";
import { useState } from "react";
import { formatINR, type Product } from "@/lib/data";
import Pic from "./Pic";
import { useStore } from "./StoreProvider";
import { HeartIcon, StarIcon } from "./Icons";

export default function ProductCard({ p }: { p: Product }) {
  const { wishlist, toggleWish, addToCart } = useStore();
  const [added, setAdded] = useState(false);
  const wished = wishlist.includes(p.id);
  const soldOut = p.inStock === false;
  const off = p.original ? Math.round((1 - p.price / p.original) * 100) : 0;

  return (
    <article className="card">
      <div className="card-media">
        <Link href={p.href} aria-label={p.name} tabIndex={-1}>
          <Pic src={p.image} alt={p.name} kind={p.kind} tone={p.tone} className="card-art" />
          {(p.image2 || !p.image) && <Pic src={p.image2} kind={p.kind} tone={p.tone === "wine" ? "sand" : "wine"} className="card-art card-art-alt" />}
        </Link>
        {soldOut && <span className="badge badge-out">Out of stock</span>}
        {!soldOut && p.badge && <span className={`badge${p.badge === "New" ? " badge-new" : ""}`}>{p.badge === "New" ? "New Arrival" : p.badge}</span>}
        <button
          className={`wish${wished ? " on" : ""}`}
          onClick={() => toggleWish(p.id)}
          aria-pressed={wished}
          aria-label={wished ? `Remove ${p.name} from wishlist` : `Add ${p.name} to wishlist`}
        >
          <HeartIcon filled={wished} />
        </button>
        <button
          className="quick-add"
          disabled={soldOut}
          onClick={() => {
            addToCart(p.id);
            setAdded(true);
            setTimeout(() => setAdded(false), 1600);
          }}
        >
          {soldOut ? "Sold out" : added ? "Added to bag" : "Quick add"}
        </button>
      </div>
      <div className="card-body">
        <h3><Link href={p.href}>{p.name}</Link></h3>
        {p.reviews > 0 && (<p className="rating" aria-label={`Rated ${p.rating} out of 5 from ${p.reviews} reviews`}>
          <StarIcon className="star" /> {p.rating.toFixed(1)} <span>({p.reviews})</span>
        </p>)}
        <p className="price">
          <strong>{formatINR(p.price)}</strong>
          {p.original && (
            <>
              <s>{formatINR(p.original)}</s>
              <em>{off}% off</em>
            </>
          )}
        </p>
      </div>
    </article>
  );
}
