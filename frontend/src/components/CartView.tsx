"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { similarTo, unit, useCatalog } from "@/lib/catalog";
import { formatINR } from "@/lib/data";
import { useAppConfig } from "@/lib/config";
import { COUPON_KEY } from "@/lib/orders";
import { getQuote, type Quote } from "@/lib/shop";
import Pic from "./Pic";
import ProductCard from "./ProductCard";
import { useStore } from "./StoreProvider";
import { ArrowLeft, BagIcon } from "./Icons";


export default function CartView() {
  const { ready, lines, setQty, removeLine, moveLineToWishlist } = useStore();
  const { config } = useAppConfig();
  const { products, byId } = useCatalog();
  const freeAbove = config?.freeShippingAbove ?? null;
  const [code, setCode] = useState("");
  const [coupon, setCoupon] = useState<string | null>(null);
  const [couponMsg, setCouponMsg] = useState("");

  const [cq, setCq] = useState<Quote | null>(null);

  /* carry an applied coupon over from an earlier visit */
  useEffect(() => {
    try {
      const c = localStorage.getItem(COUPON_KEY);
      if (c) {
        setCoupon(c);
        setCode(c);
      }
    } catch {
      /* ignore */
    }
  }, []);

  /* Re-price and re-check stock from current catalog data every render. */
  const rows = useMemo(
    () =>
      lines.map((line) => {
        const p = byId(line.id);
        if (!p) return { line, p: undefined, v: undefined, qty: 0, gone: true };
        const v = unit(p, line.variantId);
        const gone = v.stock <= 0;
        return { line, p, v, qty: gone ? 0 : Math.min(line.qty, v.stock), gone };
      }),
    [lines, byId],
  );

  /* never keep more in the cart than is available */
  useEffect(() => {
    rows.forEach((r) => {
      if (!r.gone && r.v && r.line.qty > r.v.stock) setQty(r.line.key, r.v.stock);
    });
  }, [rows, setQty]);

  const live = rows.filter((r) => !r.gone && r.p && r.v);
  const mrpTotal = live.reduce((a, r) => a + (r.v!.original ?? r.v!.price) * r.qty, 0);
  const sellTotal = live.reduce((a, r) => a + r.v!.price * r.qty, 0);
  const discount = mrpTotal - sellTotal;
  const couponOff = cq ? cq.discount : 0;
  const afterCoupon = sellTotal - couponOff;
  const shipping = cq ? cq.shippingCharge : live.length === 0 || (freeAbove != null && afterCoupon >= freeAbove) ? 0 : (config?.shippingCharge ?? 0);
  const total = cq ? cq.totalAmount : afterCoupon + shipping;
  const remaining = freeAbove != null ? Math.max(0, freeAbove - afterCoupon) : 0;
  const blocked = rows.some((r) => r.gone);

  /* the shop's own prices, coupon and delivery charge */
  const bagSig = live.map((r) => `${r.p!.id}:${r.line.variantId ?? ""}:${r.qty}`).join("|");
  useEffect(() => {
    if (!ready || live.length === 0) return;
    let stale = false;
    const t = setTimeout(async () => {
      try {
        const items = live.map((r) => ({ productId: r.p!.id, ...(r.line.variantId ? { variantId: r.line.variantId } : {}), quantity: r.qty }));
        const q = await getQuote(items, { couponCode: coupon });
        if (stale) return;
        setCq(q);
        if (coupon) {
          if (q.couponCode) setCouponMsg(`${q.couponCode} applied.`);
          else if (q.couponError) {
            setCouponMsg(q.couponError);
            setCoupon(null);
            try { localStorage.removeItem(COUPON_KEY); } catch { /* ignore */ }
          }
        }
      } catch {
        if (!stale) setCq(null); // server unreachable: fall back to the figures on this page
      }
    }, 250);
    return () => {
      stale = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, bagSig, coupon]);

  const applyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) return;
    setCouponMsg("");
    setCoupon(c); // the server checks it (effect above) and the message follows
    try { localStorage.setItem(COUPON_KEY, c); } catch { /* ignore */ }
  };

  const addOns = useMemo(() => {
    const inCart = new Set(lines.map((l) => l.id));
    const first = byId(lines[0]?.id);
    if (!first) return [];
    return similarTo(products, first, 10).filter((x) => !inCart.has(x.id) && x.inStock !== false).slice(0, 4);
  }, [lines, products, byId]);

  if (!ready) return <div className="page-white"><div className="wrap cart" aria-busy="true" /></div>;

  return (
    <div className="page-white">
      <div className="wrap cart">
        <Link href="/shop" className="back-link"><ArrowLeft /> Continue browsing</Link>
        <h1 className="cart-title">Shopping Cart</h1>

        {lines.length === 0 ? (
          <div className="wl-empty">
            <BagIcon className="wl-heart" />
            <h2 className="h3">Your bag is empty</h2>
            <p>Pieces you add will wait for you here.</p>
            <Link href="/shop" className="btn btn-wine btn-sq">Explore jewellery</Link>
          </div>
        ) : (
          <div className="cart-grid">
            <div>
              {blocked && (
                <p className="cart-alert" role="alert">
                  Some items are no longer available. Remove them or move them to your wishlist to continue.
                </p>
              )}
              <ul className="cart-list">
                {rows.map(({ line, p, v, qty, gone }) => {
                  if (!p || !v) {
                    return (
                      <li key={line.key} className="cart-item gone">
                        <p>This product is no longer available.</p>
                        <button className="link-btn" onClick={() => removeLine(line.key)}>Remove</button>
                      </li>
                    );
                  }
                  return (
                    <li key={line.key} className={`cart-item${gone ? " gone" : ""}`}>
                      <Link href={p.href} className="cart-media" aria-label={p.name}>
                        <Pic src={p.image} alt={p.name} kind={p.kind} tone={p.tone} className="fill" />
                      </Link>
                      <div className="cart-body">
                        <h2><Link href={p.href}>{p.name}</Link></h2>
                        {v.name && <p className="cart-var">{v.name}</p>}
                        <p className="cart-sku">SKU {v.sku}</p>

                        {gone ? (
                          <p className="pdp-stock out">Out of stock</p>
                        ) : (
                          <>
                            <div className="qty">
                              <button type="button" onClick={() => (qty > 1 ? setQty(line.key, qty - 1) : removeLine(line.key))} aria-label={`Decrease quantity of ${p.name}`}>−</button>
                              <output aria-live="polite">{qty}</output>
                              <button type="button" disabled={qty >= v.stock} onClick={() => setQty(line.key, qty + 1)} aria-label={`Increase quantity of ${p.name}`}>+</button>
                            </div>
                            {v.stock <= 5 && <p className="pdp-stock low">{qty >= v.stock ? `Maximum available: ${v.stock}` : `Only ${v.stock} left`}</p>}
                          </>
                        )}

                        <div className="cart-actions">
                          <button className="link-btn" onClick={() => removeLine(line.key)}>Remove</button>
                          <button className="link-btn" onClick={() => moveLineToWishlist(line.key)}>Move to wishlist</button>
                        </div>
                      </div>
                      <p className="cart-price">
                        {gone ? "" : formatINR(v.price * qty)}
                        {!gone && v.original && <s>{formatINR(v.original * qty)}</s>}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>

            <aside className="summary" aria-label="Order summary">
              <h2>Order Summary</h2>

              {freeAbove != null && (
              <div className="ship-bar">
                <p>
                  {remaining === 0
                    ? "You've unlocked free shipping."
                    : `Add ${formatINR(remaining)} more for free shipping.`}
                </p>
                <div className="bar"><i style={{ width: `${Math.min(100, (afterCoupon / freeAbove) * 100)}%` }} /></div>
              </div>
              )}

              <dl className="sum-rows">
                <div><dt>Subtotal</dt><dd>{formatINR(mrpTotal)}</dd></div>
                {discount > 0 && <div><dt>Discount</dt><dd>−{formatINR(discount)}</dd></div>}
                {couponOff > 0 && <div><dt>Coupon ({cq?.couponCode ?? coupon})</dt><dd>−{formatINR(couponOff)}</dd></div>}
                <div><dt>Shipping</dt><dd>{shipping === 0 ? "Free" : formatINR(shipping)}</dd></div>
                <div className="sum-total"><dt>Total payable</dt><dd>{formatINR(total)}</dd></div>
              </dl>
              <p className="sum-note">Prices are inclusive of applicable taxes.</p>

              <form className="coupon" onSubmit={applyCoupon}>
                <label className="sr-only" htmlFor="coupon">Coupon code</label>
                <input id="coupon" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Coupon code" />
                <button className="btn btn-outline btn-sq" type="submit" disabled={!code.trim()}>Apply</button>
              </form>
              {couponMsg && <p className={`coupon-msg${cq?.couponCode ? " ok" : ""}`} role="status">{couponMsg}</p>}

              {blocked || live.length === 0 ? (
                <button className="btn btn-wine btn-sq checkout" disabled>Proceed to checkout</button>
              ) : (
                <Link href="/checkout" className="btn btn-wine btn-sq checkout">Proceed to checkout</Link>
              )}
              <p className="sum-note center-t">Your cart is checked again for price and stock before you pay.</p>

              <div className="help">
                <h3>Need help?</h3>
                <ul>
                  <li><Link href="/shipping-policy">Shipping policy</Link></li>
                  <li><Link href="/returns-refunds">Returns &amp; refunds</Link></li>
                  <li><Link href="/jewellery-care">Jewellery care</Link></li>
                  <li><Link href="/privacy-policy">Privacy policy</Link></li>
                </ul>
              </div>
            </aside>
          </div>
        )}

        {addOns.length > 0 && (
          <section className="pdp-sec" aria-labelledby="add-h">
            <h2 id="add-h" className="h3">Complete the look</h2>
            <div className="product-grid four">
              {addOns.map((x) => <ProductCard key={x.id} p={x} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
