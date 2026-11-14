"use client";

/*
 * The shop's catalogue, read from the backend (products, categories, collections).
 * Nothing about a product is written into the storefront: every page reads it from here.
 */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { API_URL } from "./auth";
import { buildCollections, slugify, type Collection } from "./collections";
import type { ArtKind, Product, Tone } from "./data";

export type Variant = { id: string; name: string; sku: string; price: number; original?: number; stock: number; attributes: Record<string, string> };

export type CatalogProduct = Product & {
  slug: string;
  sku: string;
  category: string;
  categorySlug: string;
  collections: string[];
  /** deities / symbols on the piece, e.g. "Lord Ganesha" */
  deity: string[];
  material: string;
  plating: string;
  occasions: string[];
  style: string[];
  /** higher = newer */
  created: number;
  stock: number;
  variants: Variant[];
  images: string[];
  shortDescription: string;
  description: string;
  specs: [string, string][];
  careInstructions?: string;
  returnable: boolean;
};

export type Category = { id: string; name: string; slug: string; image?: string; blurb?: string; sortOrder: number };

/* ---------- raw shapes from the API ---------- */
type Img = { url?: string } | null;
type RawVariant = { _id: string; name: string; sku: string; price?: number | null; salePrice?: number | null; stock: number; attributes?: Record<string, string> };
export type RawProduct = {
  _id: string;
  slug: string;
  name: string;
  sku: string;
  category?: { _id?: string; name: string; slug: string } | null;
  price: number;
  salePrice?: number | null;
  stock: number;
  thumbnail?: Img;
  gallery?: Img[];
  variants?: RawVariant[];
  shortDescription?: string;
  description?: string;
  material?: string;
  plating?: string;
  color?: string;
  stoneType?: string;
  style?: string;
  gender?: string;
  occasion?: string[];
  deities?: string[];
  collections?: string[];
  isBestseller?: boolean;
  isNewArrival?: boolean;
  rating?: number;
  reviewCount?: number;
  createdAt?: string;
  weightGrams?: number | null;
  dimensions?: { length?: number | null; width?: number | null; height?: number | null };
  isAntiTarnish?: boolean;
  isHypoallergenic?: boolean;
  careInstructions?: string;
  includedItems?: string;
  materialComposition?: string;
  warranty?: { months?: number | null; details?: string };
  specifications?: { label: string; value: string }[];
  returnable?: boolean;
};

const GENDER: Record<string, string> = { women: "Women's", girls: "Girls'", men: "Men's", unisex: "Unisex" };
const TONES: Tone[] = ["sand", "wine", "ivory", "gold"];

/** Which drawing stands in when a product has no photograph. */
function kindOf(p: RawProduct): ArtKind {
  const d = (p.deities ?? []).join(" ").toLowerCase();
  for (const [needle, k] of [["ganesh", "ganesha"], ["shiv", "shiva"], ["krishn", "krishna"], ["laksh", "lakshmi"], ["durga", "durga"], ["om", "om"]] as [string, ArtKind][]) {
    if (d.includes(needle) && (needle !== "om" || /\bom\b/.test(d))) return k;
  }
  if (/mangalsutra/i.test(p.name)) return "mangalsutra";
  const c = p.category?.slug ?? "";
  if (c.startsWith("necklace")) return "necklace";
  if (c.startsWith("earring")) return "earring";
  if (c.startsWith("ring")) return "ring";
  if (c.startsWith("bracelet")) return "bracelet";
  return "pendant";
}

const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

const url = (i?: Img) => (i && typeof i === "object" && i.url ? i.url : undefined);

export function mapProduct(p: RawProduct, collectionNames: Map<string, string>): CatalogProduct {
  const regular = p.price;
  const sale = p.salePrice ?? null;
  const variants: Variant[] = (p.variants ?? []).map((v) => {
    const vRegular = v.price ?? regular;
    const vSale = v.salePrice ?? (v.price != null ? null : sale);
    return {
      id: v._id,
      name: v.name,
      sku: v.sku,
      price: vSale ?? vRegular,
      original: vSale != null ? vRegular : undefined,
      stock: v.stock,
      attributes: v.attributes && typeof v.attributes === "object" ? v.attributes : {},
    };
  });
  const images = [url(p.thumbnail), ...(p.gallery ?? []).map(url)].filter((x): x is string => !!x);
  const stock = variants.length ? variants.reduce((n, v) => n + v.stock, 0) : p.stock;

  const specs: [string, string][] = [];
  const add = (k: string, v?: string | number | null) => v !== undefined && v !== null && v !== "" && specs.push([k, String(v)]);
  add("SKU", p.sku);
  add("Material", p.material);
  add("Composition", p.materialComposition);
  add("Finish", p.plating);
  add("Colour", p.color);
  add("Stones", p.stoneType);
  add("Style", p.style);
  add("Weight", p.weightGrams ? `${p.weightGrams} g` : undefined);
  const d = p.dimensions;
  if (d && (d.length || d.width || d.height)) add("Size", [d.length, d.width, d.height].filter(Boolean).join(" × ") + " mm");
  add("Occasion", (p.occasion ?? []).join(" / "));
  add("Deity / symbol", (p.deities ?? []).join(" / "));
  add("Anti-tarnish", p.isAntiTarnish ? "Yes" : undefined);
  add("Hypoallergenic", p.isHypoallergenic ? "Yes" : undefined);
  add("Included", p.includedItems);
  add("Warranty", p.warranty?.months ? `${p.warranty.months} months${p.warranty.details ? `: ${p.warranty.details}` : ""}` : undefined);
  for (const s of p.specifications ?? []) add(s.label, s.value);

  return {
    id: p._id,
    slug: p.slug,
    sku: p.sku,
    name: p.name,
    price: sale ?? regular,
    original: sale != null ? regular : undefined,
    rating: p.rating ?? 0,
    reviews: p.reviewCount ?? 0,
    badge: p.isNewArrival ? "New" : p.isBestseller ? "Bestseller" : undefined,
    kind: kindOf(p),
    tone: TONES[hash(p._id) % TONES.length],
    href: `/product/${p.slug}`,
    inStock: stock > 0,
    image: images[0],
    image2: images[1],
    images,
    category: p.category?.name ?? "",
    categorySlug: p.category?.slug ?? "",
    collections: (p.collections ?? []).map((id) => collectionNames.get(String(id))).filter((x): x is string => !!x),
    deity: p.deities ?? [],
    material: p.material ?? "",
    plating: p.plating ?? "",
    occasions: p.occasion ?? [],
    style: [p.style, p.gender ? GENDER[p.gender] : undefined].filter((x): x is string => !!x),
    created: p.createdAt ? Date.parse(p.createdAt) : 0,
    stock,
    variants,
    shortDescription: p.shortDescription ?? "",
    description: p.description || p.shortDescription || "",
    specs,
    careInstructions: p.careInstructions || undefined,
    returnable: p.returnable !== false,
  };
}

/* ---------- price / stock for a chosen option ---------- */
export const variantOf = (p: CatalogProduct, variantId?: string | null) => p.variants.find((v) => v.id === variantId);
export const unit = (p: CatalogProduct, variantId?: string | null) => {
  const v = variantOf(p, variantId);
  return { price: v?.price ?? p.price, original: v ? v.original : p.original, stock: v ? v.stock : p.stock, sku: v?.sku ?? p.sku, name: v?.name };
};
/** The option a product opens on: the first one that is in stock. */
export const defaultVariantId = (p: CatalogProduct) => (p.variants.length ? (p.variants.find((v) => v.stock > 0) ?? p.variants[0]).id : undefined);

/** Products related to this one: same collections, category or deity first. */
export function similarTo(all: CatalogProduct[], p: CatalogProduct, n = 4) {
  return all
    .filter((x) => x.id !== p.id)
    .map((x) => ({
      x,
      s: (x.categorySlug === p.categorySlug ? 2 : 0) + p.deity.filter((d) => x.deity.includes(d)).length * 3 + x.collections.filter((c) => p.collections.includes(c)).length,
    }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((r) => r.x);
}

/* ---------- provider ---------- */
type Ctx = {
  products: CatalogProduct[];
  categories: Category[];
  collections: Collection[];
  /** true once the first answer (or failure) is in */
  ready: boolean;
  failed: boolean;
  byId: (id: string) => CatalogProduct | undefined;
  bySlug: (slug: string) => CatalogProduct | undefined;
};

const CatalogCtx = createContext<Ctx>({ products: [], categories: [], collections: [], ready: false, failed: false, byId: () => undefined, bySlug: () => undefined });

async function getJson(path: string) {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const [raw, setRaw] = useState<{ products: RawProduct[]; cats: unknown[]; cols: unknown[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stale = false;
    // A copy kept for a few minutes: page reloads show the shop at once and ask the server at most once a minute.
    const CACHE = "ofh-catalog-v1";
    let age = Infinity;
    try {
      const saved = JSON.parse(sessionStorage.getItem(CACHE) ?? "null");
      if (saved?.raw && Date.now() - saved.t < 5 * 60 * 1000) {
        age = Date.now() - saved.t;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRaw(saved.raw);
        setReady(true);
      }
    } catch {
      /* no saved copy */
    }
    if (age < 60 * 1000) return;
    (async () => {
      try {
        const [cats, cols] = await Promise.all([getJson("/product-categories"), getJson("/collections")]);
        const products: RawProduct[] = [];
        for (let page = 1; page <= 20; page++) {
          const j = await getJson(`/products?limit=100&page=${page}`);
          products.push(...(j.data ?? []));
          if (page >= (j.pagination?.totalPages ?? 1)) break;
        }
        const fresh = { products, cats: cats.data ?? [], cols: cols.data ?? [] };
        if (!stale) setRaw(fresh);
        try { sessionStorage.setItem(CACHE, JSON.stringify({ t: Date.now(), raw: fresh })); } catch { /* too big or unavailable */ }
      } catch {
        if (!stale && age === Infinity) setFailed(true); // with a saved copy on screen, a failed refresh is ignored
      } finally {
        if (!stale) setReady(true);
      }
    })();
    return () => {
      stale = true;
    };
  }, []);

  const value = useMemo<Ctx>(() => {
    const cols = (raw?.cols ?? []) as { _id: string; name: string; slug: string; description?: string; image?: Img; banner?: Img; sortOrder?: number }[];
    const names = new Map(cols.map((c) => [c._id, c.name]));
    const products = (raw?.products ?? []).map((p) => mapProduct(p, names));
    const categories: Category[] = ((raw?.cats ?? []) as { _id: string; name: string; slug: string; image?: Img; shortDescription?: string; sortOrder?: number; parent?: string | null }[])
      .filter((c) => !c.parent)
      .map((c) => ({ id: c._id, name: c.name, slug: c.slug, image: url(c.image), blurb: c.shortDescription, sortOrder: c.sortOrder ?? 0 }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const collections = buildCollections(
      products,
      categories,
      cols.map((c) => ({ name: c.name, slug: c.slug, description: c.description, image: url(c.image) ?? url(c.banner), sortOrder: c.sortOrder ?? 0 })),
    );
    const byIdMap = new Map(products.map((p) => [p.id, p]));
    const bySlugMap = new Map(products.map((p) => [p.slug, p]));
    return { products, categories, collections, ready, failed, byId: (id) => byIdMap.get(id), bySlug: (s) => bySlugMap.get(s) };
  }, [raw, ready, failed]);

  return <CatalogCtx.Provider value={value}>{children}</CatalogCtx.Provider>;
}

export const useCatalog = () => useContext(CatalogCtx);
export { slugify };
