"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { API_URL } from "@/lib/auth";

/* eslint-disable @next/next/no-img-element */
type Offer = {
  _id: string;
  title: string;
  subtitle?: string;
  ctaText?: string;
  placement?: "hero" | "promo";
  link: string;
  image?: { url?: string };
  mobileImage?: { url?: string };
};

/** Old links pointed at a shop that used /products; this storefront's shop lives at /shop. */
const target = (link: string) => (/^\/products(\/|\?|$)/.test(link) ? "/shop" : link);
const external = (l: string) => /^https?:\/\//i.test(l);

function Banner({ o, priority = false }: { o: Offer; priority?: boolean }) {
  const href = target(o.link || "/shop");
  const desktop = o.image?.url;
  const mobile = o.mobileImage?.url;
  if (!desktop) return null;
  const body = (
    <>
      <picture>
        {mobile && <source media="(max-width: 700px)" srcSet={mobile} />}
        <img src={desktop} alt={o.title} loading={priority ? "eager" : "lazy"} />
      </picture>
      {(o.subtitle || o.ctaText) && (
        <span className="offer-copy">
          <strong>{o.title}</strong>
          {o.subtitle && <span>{o.subtitle}</span>}
          {o.ctaText && <em className="btn btn-gold">{o.ctaText}</em>}
        </span>
      )}
    </>
  );
  return external(href) ? (
    <a href={href} className="offer" target="_blank" rel="noopener noreferrer" aria-label={o.title}>{body}</a>
  ) : (
    <Link href={href} className="offer" aria-label={o.title}>{body}</Link>
  );
}

/** The shop's current offers, set in the console under Offers. Nothing is shown when there are none. */
export default function OfferBanners() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let stale = false;
    fetch(`${API_URL}/offers/active`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!stale && Array.isArray(j?.data)) setOffers(j.data.filter((o: Offer) => o.image?.url));
      })
      .catch(() => {
        /* no offers shown */
      });
    return () => {
      stale = true;
    };
  }, []);

  const hero = offers.filter((o) => o.placement === "hero");
  const promo = offers.filter((o) => o.placement !== "hero");

  useEffect(() => {
    if (hero.length < 2 || paused) return;
    const t = setInterval(() => setI((n) => (n + 1) % hero.length), 5500);
    return () => clearInterval(t);
  }, [hero.length, paused]);

  if (offers.length === 0) return null;

  return (
    <section className="offers wrap" aria-label="Offers">
      {hero.length > 0 && (
        <div
          className="offer-slider"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          aria-roledescription="carousel"
        >
          {hero.map((o, n) => (
            <div key={o._id} className={`offer-slide${n === i % hero.length ? " on" : ""}`} aria-hidden={n !== i % hero.length}>
              <Banner o={o} priority={n === 0} />
            </div>
          ))}
          {hero.length > 1 && (
            <div className="offer-dots">
              {hero.map((o, n) => (
                <button key={o._id} type="button" className={n === i % hero.length ? "on" : ""} aria-label={`Show offer ${n + 1}`} onClick={() => setI(n)} />
              ))}
            </div>
          )}
        </div>
      )}
      {promo.length > 0 && (
        <div className={`offer-grid n${Math.min(promo.length, 3)}`}>
          {promo.map((o) => (
            <Banner key={o._id} o={o} />
          ))}
        </div>
      )}
    </section>
  );
}
