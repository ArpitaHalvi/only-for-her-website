"use client";

import { useEffect, useMemo, useState } from "react";
import { useCatalog, type CatalogProduct } from "@/lib/catalog";
import CatalogStatus from "./CatalogStatus";
import ProductCard from "./ProductCard";
import { ChevronDown, CloseIcon } from "./Icons";

type GroupKey = "category" | "collections" | "deity" | "material" | "plating" | "occasions" | "style";

const GROUPS: { key: GroupKey; title: string }[] = [
  { key: "category", title: "Category" },
  { key: "collections", title: "Collection" },
  { key: "deity", title: "Deity / Motif" },
  { key: "material", title: "Material" },
  { key: "plating", title: "Plating" },
  { key: "occasions", title: "Occasion" },
  { key: "style", title: "Gender / Style" },
];

const SORTS = [
  { v: "featured", label: "Featured" },
  { v: "newest", label: "Newest First" },
  { v: "price-asc", label: "Price: Low to High" },
  { v: "price-desc", label: "Price: High to Low" },
  { v: "best", label: "Bestselling" },
  { v: "rated", label: "Top Rated" },
] as const;

const PAGE = 12;

const valuesOf = (p: CatalogProduct, k: GroupKey): string[] => {
  const v = p[k];
  return Array.isArray(v) ? v : v ? [v] : [];
};

type Sel = Record<GroupKey, string[]>;
const empty: Sel = { category: [], collections: [], deity: [], material: [], plating: [], occasions: [], style: [] };

export default function ShopClient({ products: given, view = "all" }: { products?: CatalogProduct[]; view?: "all" | "bestsellers" | "new" }) {
  const { products: everything, ready, failed } = useCatalog();
  const products = useMemo(() => {
    const base = given ?? everything;
    if (view === "bestsellers") return base.filter((p) => p.badge === "Bestseller");
    if (view === "new") return base.filter((p) => p.badge === "New");
    return base;
  }, [given, everything, view]);
  const [sel, setSel] = useState<Sel>(empty);
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [stock, setStock] = useState<"all" | "in" | "out">("all");
  const [sort, setSort] = useState<(typeof SORTS)[number]["v"]>("featured");
  const [limit, setLimit] = useState(PAGE);
  const [panel, setPanel] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  /* options only come from real inventory */
  const options = useMemo(() => {
    const out = {} as Record<GroupKey, [string, number][]>;
    for (const g of GROUPS) {
      const m = new Map<string, number>();
      products.forEach((p) => valuesOf(p, g.key).forEach((v) => m.set(v, (m.get(v) ?? 0) + 1)));
      out[g.key] = [...m.entries()].sort((a, b) => b[1] - a[1]);
    }
    return out;
  }, [products]);

  /* a filter with a single value can't narrow anything, so hide it */
  const groups = GROUPS.filter((g) => options[g.key].length > 1);

  const results = useMemo(() => {
    const lo = min === "" ? 0 : Number(min);
    const hi = max === "" ? Infinity : Number(max);
    const list = products.filter((p) => {
      for (const g of GROUPS) {
        const chosen = sel[g.key];
        if (chosen.length && !valuesOf(p, g.key).some((v) => chosen.includes(v))) return false;
      }
      if (p.price < lo || p.price > hi) return false;
      if (stock === "in" && !p.inStock) return false;
      if (stock === "out" && p.inStock) return false;
      return true;
    });
    const s = [...list];
    if (sort === "newest") s.sort((a, b) => b.created - a.created);
    if (sort === "price-asc") s.sort((a, b) => a.price - b.price);
    if (sort === "price-desc") s.sort((a, b) => b.price - a.price);
    if (sort === "best") s.sort((a, b) => Number(b.badge === "Bestseller") - Number(a.badge === "Bestseller") || b.reviews - a.reviews);
    if (sort === "rated") s.sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
    return s;
  }, [products, sel, min, max, stock, sort]);

  useEffect(() => setLimit(PAGE), [sel, min, max, stock, sort]);
  useEffect(() => {
    document.body.style.overflow = panel ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [panel]);

  const toggle = (k: GroupKey, v: string) =>
    setSel((s) => ({ ...s, [k]: s[k].includes(v) ? s[k].filter((x) => x !== v) : [...s[k], v] }));

  const chips = [
    ...GROUPS.flatMap((g) => sel[g.key].map((v) => ({ label: v, off: () => toggle(g.key, v) }))),
    ...(min || max ? [{ label: `₹${min || 0} – ${max ? "₹" + max : "any"}`, off: () => (setMin(""), setMax("")) }] : []),
    ...(stock !== "all" ? [{ label: stock === "in" ? "In stock" : "Out of stock", off: () => setStock("all") }] : []),
  ];
  const clearAll = () => {
    setSel(empty);
    setMin("");
    setMax("");
    setStock("all");
  };

  const shown = results.slice(0, limit);

  if (!given && !ready) return <CatalogStatus loading />;
  if (!given && failed) return <CatalogStatus />;

  const filters = (
    <>
      {groups.map((g) => (
        <fieldset className="f-group" key={g.key}>
          <legend>
            <button
              type="button"
              className="f-toggle"
              aria-expanded={!collapsed[g.key]}
              onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}
            >
              {g.title}
              <ChevronDown className={`chev${collapsed[g.key] ? "" : " up"}`} />
            </button>
          </legend>
          {!collapsed[g.key] && (
            <ul>
              {options[g.key].map(([v, n]) => (
                <li key={v}>
                  <label className="check">
                    <input type="checkbox" checked={sel[g.key].includes(v)} onChange={() => toggle(g.key, v)} />
                    <span className="box" />
                    {v} <small>({n})</small>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      ))}

      <fieldset className="f-group">
        <legend>Price (₹)</legend>
        <div className="price-range">
          <label>
            <span className="sr-only">Minimum price</span>
            <input inputMode="numeric" placeholder="Min" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))} />
          </label>
          <span>to</span>
          <label>
            <span className="sr-only">Maximum price</span>
            <input inputMode="numeric" placeholder="Max" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} />
          </label>
        </div>
        <ul className="presets">
          {[
            ["Under 1,000", "", "999"],
            ["1,000 – 2,000", "1000", "2000"],
            ["Above 2,000", "2001", ""],
          ].map(([l, a, b]) => (
            <li key={l}>
              <button type="button" className={min === a && max === b ? "on" : ""} onClick={() => (setMin(a), setMax(b))}>
                {l}
              </button>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="f-group">
        <legend>Availability</legend>
        <ul>
          {(
            [
              ["all", "All"],
              ["in", "In Stock"],
              ["out", "Out of Stock"],
            ] as const
          ).map(([v, l]) => (
            <li key={v}>
              <label className="check">
                <input type="radio" name="stock" checked={stock === v} onChange={() => setStock(v)} />
                <span className="box round" />
                {l}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
    </>
  );

  return (
    <div className="shop-layout">
      {/* desktop sidebar */}
      <aside className="filters" aria-label="Filters">
        <label className="sort">
          <span>Sort by:</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            {SORTS.map((s) => (
              <option key={s.v} value={s.v}>{s.label}</option>
            ))}
          </select>
        </label>
        {filters}
      </aside>

      <div className="results">
        <div className="toolbar">
          <button className="btn btn-outline filter-open" onClick={() => setPanel(true)}>
            Filters{chips.length ? ` (${chips.length})` : ""}
          </button>
          <label className="sort sort-mobile">
            <span>Sort by:</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              {SORTS.map((s) => (
                <option key={s.v} value={s.v}>{s.label}</option>
              ))}
            </select>
          </label>
          <p className="count-line" role="status">{results.length} {results.length === 1 ? "piece" : "pieces"}</p>
        </div>

        {chips.length > 0 && (
          <ul className="chips">
            {chips.map((c) => (
              <li key={c.label}>
                <button onClick={c.off} aria-label={`Remove filter ${c.label}`}>
                  {c.label} <CloseIcon />
                </button>
              </li>
            ))}
            <li><button className="clear" onClick={clearAll}>Clear all</button></li>
          </ul>
        )}

        {results.length === 0 ? (
          <div className="empty">
            <h2 className="h2">Nothing matches those filters.</h2>
            <p>Try removing a filter or two.</p>
            <button className="btn btn-wine" onClick={clearAll}>Clear all filters</button>
          </div>
        ) : (
          <div className="product-grid shop-grid">
            {shown.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        )}

        {results.length > 0 && (
          <div className="load">
            <p>Showing {shown.length} of {results.length} products</p>
            <div className="bar"><i style={{ width: `${(shown.length / results.length) * 100}%` }} /></div>
            {shown.length < results.length && (
              <button className="btn btn-outline" onClick={() => setLimit((l) => l + PAGE)}>Load more</button>
            )}
          </div>
        )}
      </div>

      {/* mobile filter drawer */}
      <div className={`drawer-scrim${panel ? " on" : ""}`} onClick={() => setPanel(false)} aria-hidden="true" />
      <aside className={`drawer filter-drawer${panel ? " on" : ""}`} aria-label="Filters" inert={!panel}>
        <div className="drawer-head">
          <span className="logo">Filters</span>
          <button className="icon-btn" onClick={() => setPanel(false)} aria-label="Close filters"><CloseIcon /></button>
        </div>
        <div className="drawer-body">{filters}</div>
        <div className="drawer-foot">
          <button className="btn btn-outline" onClick={clearAll}>Clear</button>
          <button className="btn btn-wine" onClick={() => setPanel(false)}>Show {results.length} pieces</button>
        </div>
      </aside>
    </div>
  );
}
