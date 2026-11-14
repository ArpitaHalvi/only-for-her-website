"use client";

import Link from "next/link";
import Pic from "./Pic";
import { useCatalog } from "@/lib/catalog";
import { hrefOf, productsOf, type Collection } from "@/lib/collections";

export function CollectionTile({ c }: { c: Collection }) {
  const { products } = useCatalog();
  const items = productsOf(c, products);
  const n = items.length;
  const cover = c.image ?? items[0]?.image;
  return (
    <Link href={hrefOf(c)} className="ctile">
      <span className="ctile-media">
        <Pic src={cover} alt="" kind={items[0]?.kind} tone={c.tone} className="fill" />
        <span className="ctile-count">{n} {n === 1 ? "piece" : "pieces"}</span>
      </span>
      <span className="cat-name">{c.name}</span>
      {c.blurb && <span className="cat-blurb">{c.blurb}</span>}
    </Link>
  );
}

export function TileGrid({ slugs }: { slugs: string[] }) {
  const { collections } = useCatalog();
  const items = slugs.map((s) => collections.find((c) => c.slug === s)).filter((c): c is Collection => !!c);
  if (items.length === 0) return null;
  return (
    <ul className="tile-grid">
      {items.map((c) => (
        <li key={c.slug}><CollectionTile c={c} /></li>
      ))}
    </ul>
  );
}
