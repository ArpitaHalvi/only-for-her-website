"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { defaultVariantId, similarTo, unit, useCatalog, type CatalogProduct } from "@/lib/catalog";
import { formatINR } from "@/lib/data";
import { useAppConfig } from "@/lib/config";
import { checkPin, type DeliveryResult } from "@/lib/pdp";
import Pic from "./Pic";
import ProductCard from "./ProductCard";
import ProductGallery from "./ProductGallery";
import ProductReviews from "./ProductReviews";
import { useStore } from "./StoreProvider";
import { HeartIcon, StarIcon } from "./Icons";

const RECENT_KEY = "ofh-recent-v2";

export default function ProductView({ p }: { p: CatalogProduct }) {
  const router = useRouter();
  const { config } = useAppConfig();
  const { products, byId, collections } = useCatalog();
  const { addToCart, toggleWish, wishlist } = useStore();
  const wished = wishlist.includes(p.id);

  const [variantId, setVariantId] = useState<string | undefined>(() => defaultVariantId(p));
  const [qty, setQty] = useState(1);
  const [pin, setPin] = useState("");
  const [delivery, setDelivery] = useState<DeliveryResult | null>(null);
  const [note, setNote] = useState("");
  const [bundle, setBundle] = useState<string[]>([]);
  const [recent, setRecent] = useState<CatalogProduct[]>([]);
  const buyRef = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState(false);

  useEffect(() => {
    const el = buyRef.current;
    if (!el) return;
    // The bar shows once the real Add to cart button has scrolled off the top
    const io = new IntersectionObserver(([e]) => setBar(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // browser tab title follows the product
  useEffect(() => {
    document.title = `${p.name} | Only For Her`;
  }, [p.name]);

  const u = unit(p, variantId);
  const price = u.price;
  const mrp = u.original;
  const off = mrp ? Math.round((1 - price / mrp) * 100) : 0;
  const stock = u.stock;
  const finalQty = Math.min(qty, Math.max(stock, 1));

  const images = useMemo(
    () => (p.images.length ? p.images.map((src, i) => ({ label: i === 0 ? "Front view" : `View ${i + 1}`, src, tone: p.tone })) : [{ label: "Front view", src: undefined, tone: p.tone }]),
    [p],
  );

  // pieces that go with this one, from the shop's own catalogue
  const similar = useMemo(() => similarTo(products, p, 8), [products, p]);
  const matching = useMemo(() => similar.filter((x) => x.inStock !== false && x.categorySlug !== p.categorySlug).slice(0, 2), [similar, p.categorySlug]);
  const more = useMemo(() => similar.filter((x) => !matching.includes(x)).slice(0, 4), [similar, matching]);
  useEffect(() => setBundle(matching.map((m) => m.id)), [matching]);

  useEffect(() => {
    try {
      const ids: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
      setRecent(ids.filter((id) => id !== p.id).map((id) => byId(id)).filter((c): c is CatalogProduct => !!c).slice(0, 4));
      localStorage.setItem(RECENT_KEY, JSON.stringify([p.id, ...ids.filter((id) => id !== p.id)].slice(0, 8)));
    } catch {
      /* storage unavailable */
    }
  }, [p.id, byId]);

  const divine = collections.find((c) => c.slug === "divine");
  const crumbs: { label: string; href: string }[] = [];
  if (p.deity.length && divine) crumbs.push({ label: divine.name, href: "/collections/divine" });
  if (p.categorySlug) crumbs.push({ label: p.category, href: `/category/${p.categorySlug}` });

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: p.name, url });
      else {
        await navigator.clipboard.writeText(url);
        setNote("Link copied");
        setTimeout(() => setNote(""), 2000);
      }
    } catch {
      /* user cancelled */
    }
  };

  const add = () => {
    addToCart(p.id, finalQty, { variantId });
    setNote(`Added ${finalQty} to your bag`);
    setTimeout(() => setNote(""), 2200);
  };

  const bundleItems = [p, ...matching.filter((m) => bundle.includes(m.id))];
  const bundleTotal = bundleItems.reduce((a, x) => a + (x.id === p.id ? price : x.price), 0);

  const stockLabel = stock === 0 ? "Out of stock" : stock <= 5 ? `Only ${stock} left` : "In stock";
  const free = config?.freeShippingAbove;
  const days = config?.returnWindowDays ?? 0;

  return (
    <div className="page-white">
      <div className="wrap pdp">
        <nav aria-label="Breadcrumb" className="crumbs">
          <ol>
            <li><Link href="/">Home</Link></li>
            {crumbs.map((c) => (
              <li key={c.href}><Link href={c.href}>{c.label}</Link></li>
            ))}
            <li aria-current="page">{p.name}</li>
          </ol>
        </nav>

        <div className="pdp-grid">
          <ProductGallery images={images} name={p.name} kind={p.kind} />

          <div className="pdp-info">
            {p.badge && <p className="eyebrow">{p.badge === "New" ? "New arrival" : p.badge}</p>}
            <h1 className="pdp-title">{p.name}</h1>
            {p.reviews > 0 && (
              <a href="#reviews" className="pdp-rating">
                <StarIcon className="star" /> {p.rating.toFixed(1)} <span>({p.reviews} {p.reviews === 1 ? "review" : "reviews"})</span>
              </a>
            )}
            <p className="pdp-sku">SKU: {u.sku}</p>

            <p className="pdp-price">
              <strong>{formatINR(price)}</strong>
              {mrp && (
                <>
                  <s>MRP {formatINR(mrp)}</s>
                  <em>{off}% off</em>
                </>
              )}
            </p>
            <p className="pdp-tax">Inclusive of applicable taxes, where applicable.</p>

            <p className={`pdp-stock ${stock === 0 ? "out" : stock <= 5 ? "low" : ""}`} role="status">{stockLabel}</p>

            {(p.material || p.plating) && (
              <p className="opt-label" style={{ marginTop: 22 }}>
                Material: <b>{[p.plating, p.material].filter(Boolean).join(", ")}</b>
              </p>
            )}

            {p.variants.length > 0 && (
              <fieldset className="opt">
                <legend>Choose an option: <b>{u.name}</b></legend>
                <div className="opt-row">
                  {p.variants.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className={`pill${v.id === variantId ? " on" : ""}${v.stock <= 0 ? " na" : ""}`}
                      aria-pressed={v.id === variantId}
                      onClick={() => setVariantId(v.id)}
                    >
                      {v.name}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="opt">
              <p className="opt-label">Quantity</p>
              <div className="qty">
                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity">−</button>
                <output aria-live="polite">{finalQty}</output>
                <button type="button" onClick={() => setQty((q) => Math.min(Math.max(stock, 1), q + 1))} aria-label="Increase quantity">+</button>
              </div>
            </div>

            <div className="buy-row" ref={buyRef}>
              <button className="btn btn-wine btn-sq" disabled={stock === 0} onClick={add}>
                {stock === 0 ? "Out of stock" : "Add to cart"}
              </button>
              <button
                className="btn btn-outline btn-sq"
                disabled={stock === 0}
                onClick={() => {
                  addToCart(p.id, finalQty, { variantId });
                  router.push("/checkout");
                }}
              >
                Buy now
              </button>
            </div>
            <div className={`buybar${bar ? " on" : ""}`} aria-hidden={!bar}>
              <p className="buybar-info">
                <span>{p.name}</span>
                <strong>{formatINR(price * finalQty)}</strong>
              </p>
              <button className="btn btn-wine" disabled={stock === 0} onClick={add} tabIndex={bar ? 0 : -1}>
                {stock === 0 ? "Out of stock" : "Add to cart"}
              </button>
            </div>
            <div className="sub-row">
              <button className="link-btn" onClick={() => toggleWish(p.id)} aria-pressed={wished}>
                <HeartIcon filled={wished} /> {wished ? "Saved to wishlist" : "Add to wishlist"}
              </button>
              <button className="link-btn" onClick={share}>Share</button>
              <span className="pdp-note" role="status">{note}</span>
            </div>

            <section className="deliver" aria-labelledby="del-h">
              <h2 id="del-h">Delivery availability</h2>
              <p>Enter your PIN code to check delivery.</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  checkPin(pin, price * finalQty, config).then(setDelivery);
                }}
              >
                <label className="sr-only" htmlFor="pin">PIN code</label>
                <input id="pin" inputMode="numeric" maxLength={6} placeholder="6-digit PIN code" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
                <button className="btn btn-outline btn-sq" type="submit">Check</button>
              </form>
              {delivery && (
                <div role="status" className={`del-res${delivery.ok ? "" : " bad"}`}>
                  {delivery.ok ? (
                    <ul>
                      <li>Estimated delivery by <b>{delivery.date}</b></li>
                      <li>Shipping: <b>{delivery.charge === 0 ? "Free" : formatINR(delivery.charge)}</b></li>
                      <li>Cash on delivery: <b>{delivery.cod ? "Available" : "Not available"}</b></li>
                      {delivery.note && <li>{delivery.note}</li>}
                    </ul>
                  ) : (
                    delivery.message
                  )}
                </div>
              )}
            </section>

            <div className="acc">
              {p.description && (
                <details open>
                  <summary>Product description</summary>
                  <p>{p.description}</p>
                </details>
              )}
              {p.specs.length > 0 && (
                <details>
                  <summary>Product specifications</summary>
                  <table className="specs">
                    <tbody>
                      {p.specs.map(([k, v]) => (
                        <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
              <details>
                <summary>Shipping information</summary>
                <p>
                  {free != null && free > 0 ? `Shipping is free on orders above ${formatINR(free)}. ` : config?.shippingCharge === 0 ? "Shipping is free. " : ""}
                  See our <Link href="/shipping-policy">shipping policy</Link> for delivery times.
                </p>
              </details>
              <details>
                <summary>Returns &amp; exchanges</summary>
                <p>
                  {!p.returnable
                    ? "This piece is final sale and can only be returned if it arrives faulty or not as described. "
                    : days > 0
                      ? `Unused items can be returned within ${days} days of delivery. `
                      : ""}
                  See our <Link href="/returns-refunds">returns policy</Link>.
                </p>
              </details>
              <details>
                <summary>Jewellery care</summary>
                <p>
                  {p.careInstructions ? `${p.careInstructions} ` : ""}
                  More in the <Link href="/jewellery-care">care guide</Link>.
                </p>
              </details>
            </div>
          </div>
        </div>

        {matching.length > 0 && (
          <section className="pdp-sec" aria-labelledby="fbt-h">
            <h2 id="fbt-h" className="h3">Frequently bought together</h2>
            <div className="grid items-center gap-6 min-[900px]:grid-cols-[minmax(0,1fr)_auto] min-[900px]:gap-12">
              <ul className="flex min-w-0 snap-x snap-proximity items-center gap-3 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {[p, ...matching].map((x, k) => (
                  <li key={x.id} className="flex flex-none snap-start items-center gap-3">
                    {k > 0 && <span className="text-2xl" aria-hidden="true">+</span>}
                    <label className={`relative grid w-50 cursor-pointer gap-1 text-[13px]${x.id !== p.id && !bundle.includes(x.id) ? " opacity-45" : ""}`}>
                      {x.id !== p.id && (
                        <input
                          className="absolute top-2 left-2 size-5 accent-(--wine)"
                          type="checkbox"
                          checked={bundle.includes(x.id)}
                          onChange={() => setBundle((b) => (b.includes(x.id) ? b.filter((i) => i !== x.id) : [...b, x.id]))}
                        />
                      )}
                      <Pic src={x.image} alt="" kind={x.kind} tone={x.tone} className="block h-25 w-full object-cover" />
                      <span className="font-(family-name:--font-display) text-sm">{x.id === p.id ? "This item" : x.name}</span>
                      <span>{formatINR(x.id === p.id ? price : x.price)}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="grid justify-items-start gap-2">
                <p>Total for {bundleItems.length} items</p>
                <strong className="text-[26px]">{formatINR(bundleTotal)}</strong>
                <button
                  className="btn btn-wine btn-sq"
                  disabled={stock === 0}
                  onClick={() => {
                    bundleItems.forEach((x) => (x.id === p.id ? addToCart(p.id, finalQty, { variantId }) : addToCart(x.id, 1)));
                    setNote(`Added ${bundleItems.length} items to your bag`);
                  }}
                >
                  Add all to cart
                </button>
              </div>
            </div>
          </section>
        )}

        <ProductReviews productId={p.id} rating={p.rating} total={p.reviews} />

        {more.length > 0 && (
          <section className="pdp-sec" aria-labelledby="sim-h">
            <h2 id="sim-h" className="h3">You may also like</h2>
            <div className="product-grid four">
              {more.map((x) => <ProductCard key={x.id} p={x} />)}
            </div>
          </section>
        )}

        {recent.length > 0 && (
          <section className="pdp-sec" aria-labelledby="rec-h">
            <h2 id="rec-h" className="h3">Recently viewed</h2>
            <div className="product-grid four">
              {recent.map((x) => <ProductCard key={x.id} p={x} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
