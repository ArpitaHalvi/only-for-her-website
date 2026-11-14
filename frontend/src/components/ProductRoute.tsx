"use client";

import { notFound } from "next/navigation";
import { useCatalog } from "@/lib/catalog";
import CatalogStatus from "./CatalogStatus";
import ProductView from "./ProductView";

/** A product page: found by its address in the shop's catalogue, or the 404 page when there is no such product. */
export default function ProductRoute({ slug }: { slug: string }) {
  const { bySlug, ready, failed } = useCatalog();
  const p = bySlug(slug);
  if (p) return <ProductView p={p} />;
  if (!ready) return <CatalogStatus loading />;
  if (failed) return <CatalogStatus />;
  notFound();
}
