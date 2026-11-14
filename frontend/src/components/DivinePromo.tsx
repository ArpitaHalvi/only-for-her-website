"use client";

import Link from "next/link";
import JewelArt from "./JewelArt";
import { useCatalog } from "@/lib/catalog";

/** A banner for the divine collection, shown only when the shop has one. */
export default function DivinePromo() {
  const { collections } = useCatalog();
  if (!collections.some((c) => c.slug === "divine")) return null;
  return (
    <Link href="/collections/divine" className="promo">
      <span className="promo-art" aria-hidden="true">
        <JewelArt kind="ganesha" tone="wine" bare className="fill" />
      </span>
      <span className="promo-copy">
        <small>Divine collection</small>
        <strong>Carry your faith. Celebrate your style.</strong>
      </span>
      <span className="promo-cta">Explore</span>
    </Link>
  );
}
