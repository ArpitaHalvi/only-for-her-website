"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useCatalog } from "@/lib/catalog";
import { hrefOf, productsOf } from "@/lib/collections";
import type { ArtKind, Tone } from "@/lib/data";
import JewelArt from "./JewelArt";
import Pic from "./Pic";
import ProductCard from "./ProductCard";
import { ArrowRight } from "./Icons";

/* Homepage sections whose content comes from the shop's catalogue. A section with nothing to show is left out. */

const KIND_BY_CATEGORY: [string, ArtKind][] = [["necklace", "necklace"], ["earring", "earring"], ["ring", "ring"], ["bracelet", "bracelet"], ["mangalsutra", "mangalsutra"], ["pendant", "pendant"]];
const TONES: Tone[] = ["sand", "ivory", "gold", "wine"];

export function CategorySection() {
  const { categories } = useCatalog();
  if (categories.length === 0) return null;
  return (
    <section className="section wrap" aria-labelledby="cat-h">
      <header className="sec-head">
        <h2 className="h2" id="cat-h">Find your piece</h2>
      </header>
      <ul className="cat-grid arches">
        {categories.slice(0, 8).map((c, i) => (
          <li key={c.slug}>
            <Link href={`/category/${c.slug}`} className="cat">
              <span className="cat-media">
                <Pic src={c.image} alt="" kind={KIND_BY_CATEGORY.find(([k]) => c.slug.startsWith(k))?.[1] ?? "pendant"} tone={TONES[i % 4]} className="fill" />
              </span>
              <span className="cat-name">{c.name}</span>
              {c.blurb && <span className="cat-blurb">{c.blurb}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ProductSection({ id, title, sub, view, href, cta, limit }: { id: string; title: string; sub?: string; view: "Bestseller" | "New"; href: string; cta: string; limit: number }) {
  const { products } = useCatalog();
  const items = useMemo(() => products.filter((p) => p.badge === view).slice(0, limit), [products, view, limit]);
  if (items.length === 0) return null;
  return (
    <section className="section wrap" aria-labelledby={id}>
      <header className="sec-head">
        <h2 className="h2" id={id}>{title}</h2>
        {sub && <p className="sub">{sub}</p>}
      </header>
      <div className={`product-grid${view === "New" ? " four" : ""}`}>
        {items.map((p) => (
          <ProductCard key={p.id} p={p} />
        ))}
      </div>
      <div className="center">
        <Link href={href} className="btn btn-wine">{cta} <ArrowRight /></Link>
      </div>
    </section>
  );
}

export function DivineSection() {
  const { collections, products } = useCatalog();
  const divine = collections.find((c) => c.slug === "divine");
  const deities = collections.filter((c) => c.group === "divine" && c.slug !== "divine").slice(0, 6);
  if (!divine || deities.length === 0) return null;
  return (
    <section className="divine" aria-labelledby="divine-h">
      <div className="wrap divine-grid">
        <div className="divine-copy">
          <h2 className="h2" id="divine-h">Faith, worn close.</h2>
          <p>{divine.description}</p>
          <div>
            <Link href="/collections/divine" className="btn btn-gold">Explore the divine collection <ArrowRight /></Link>
          </div>
        </div>
        <ul className="deity-grid">
          {deities.map((d) => {
            const items = productsOf(d, products);
            return (
              <li key={d.slug}>
                <Link href={hrefOf(d)} className="deity">
                  <span className="deity-medal">
                    <JewelArt kind={items[0]?.kind ?? "om"} tone="wine" bare className="fill" />
                  </span>
                  <span className="deity-name">{d.name}</span>
                  <span className="deity-line">{d.blurb}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export function OccasionSection() {
  const { collections, products } = useCatalog();
  const list = collections.filter((c) => c.group === "occasion").slice(0, 4);
  if (list.length === 0) return null;
  return (
    <section className="section wrap" aria-labelledby="occ-h">
      <header className="sec-head">
        <h2 className="h2" id="occ-h">Dressed for the occasion</h2>
      </header>
      <ul className="occ-grid">
        {list.map((o) => {
          const items = productsOf(o, products);
          return (
            <li key={o.slug}>
              <Link href={hrefOf(o)} className="occ">
                <span className="occ-art"><Pic src={items[0]?.image} alt="" kind={items[0]?.kind} tone={o.tone} className="fill" /></span>
                <span className="occ-text">
                  <strong>{o.name}</strong>
                  <span>{o.blurb}</span>
                </span>
                <span className="occ-go" aria-hidden="true"><ArrowRight /></span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
