"use client";

import Link from "next/link";
import { useCatalog } from "@/lib/catalog";
import ShopClient from "./ShopClient";
import { TileGrid } from "./CollectionTiles";
import { GROUP_LABELS, productsOf, type Collection } from "@/lib/collections";

export default function CollectionPage({ c }: { c: Collection }) {
  const { products: all } = useCatalog();
  const products = productsOf(c, all);
  const crumbs =
    c.group === "type"
      ? [{ l: "Shop", h: "/shop" }]
      : [{ l: "Collections", h: "/collections" }];

  return (
    <main id="main">
      {/* 1-2. hero banner, name and description */}
      <section className={`coll-hero tone-${c.tone}`}>
        <div className="wrap coll-hero-inner">
          <nav aria-label="Breadcrumb" className="crumbs">
            <ol>
              <li><Link href="/">Home</Link></li>
              {crumbs.map((x) => (
                <li key={x.l}><Link href={x.h}>{x.l}</Link></li>
              ))}
              <li aria-current="page">{c.name}</li>
            </ol>
          </nav>
          <p className="eyebrow">{GROUP_LABELS[c.group]}</p>
          <h1 className="display">{c.title}</h1>
          <p className="lede">{c.description}</p>
          <p className="coll-count">{products.length} {products.length === 1 ? "piece" : "pieces"}</p>
        </div>
      </section>

      {/* 3. featured motifs / categories */}
      {c.featured && (
        <section className="wrap coll-featured" aria-labelledby="feat-h">
          <h2 id="feat-h" className="h3">Shop by deity &amp; symbol</h2>
          <TileGrid slugs={c.featured} />
        </section>
      )}

      {/* 4-5. listing with filters and sorting */}
      <div className="wrap" id="products">
        <ShopClient key={c.slug} products={products} />
      </div>

      {/* 6. related */}
      <section className="wrap coll-related" aria-labelledby="rel-h">
        <h2 id="rel-h" className="h3">You may also like</h2>
        <TileGrid slugs={c.related} />
      </section>

      {/* 7. SEO copy */}
      <section className="wrap seo" aria-labelledby="seo-h">
        <h2 id="seo-h" className="h2">About the {c.name.toLowerCase()}</h2>
        {c.seo.map((t) => (
          <p key={t}>{t}</p>
        ))}
      </section>
    </main>
  );
}
