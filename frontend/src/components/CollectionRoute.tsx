"use client";

import { notFound } from "next/navigation";
import { useCatalog } from "@/lib/catalog";
import CatalogStatus from "./CatalogStatus";
import CollectionPage from "./CollectionPage";

/** A category or collection page, found in the shop's catalogue; the 404 page when there is no such collection. */
export default function CollectionRoute({ slug, type }: { slug: string; type: boolean }) {
  const { collections, ready, failed } = useCatalog();
  const c = collections.find((x) => x.slug === slug && (x.group === "type") === type);
  if (c) return <CollectionPage c={c} />;
  if (!ready) return <CatalogStatus loading />;
  if (failed) return <CatalogStatus />;
  notFound();
}
