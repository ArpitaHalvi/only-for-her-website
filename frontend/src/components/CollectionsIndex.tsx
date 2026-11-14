"use client";

import Link from "next/link";
import { useCatalog } from "@/lib/catalog";
import { GROUP_LABELS, type Group } from "@/lib/collections";
import CatalogStatus from "./CatalogStatus";
import { TileGrid } from "./CollectionTiles";

const order: Group[] = ["divine", "type", "theme", "occasion"];

export default function CollectionsIndex() {
  const { collections, ready, failed } = useCatalog();
  if (!ready) return <CatalogStatus loading />;
  if (failed) return <CatalogStatus />;
  return (
    <main id="main">
      <section className="coll-hero tone-sand">
        <div className="wrap coll-hero-inner">
          <nav aria-label="Breadcrumb" className="crumbs">
            <ol>
              <li><Link href="/">Home</Link></li>
              <li aria-current="page">Collections</li>
            </ol>
          </nav>
          <h1 className="display">Find the collection that feels like you</h1>
          <p className="lede">By type, by theme, by occasion, or inspired by the divine.</p>
        </div>
      </section>
      {order.map((g) => {
        const slugs = collections.filter((c) => c.group === g && !(g === "divine" && false)).map((c) => c.slug);
        if (slugs.length === 0) return null;
        return (
          <section key={g} className="wrap coll-featured" aria-label={GROUP_LABELS[g]}>
            <h2 className="h3">{GROUP_LABELS[g]}</h2>
            <TileGrid slugs={slugs} />
          </section>
        );
      })}
      <div className="coll-related" />
    </main>
  );
}
