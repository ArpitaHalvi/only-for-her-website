import Link from "next/link";
import Hero from "@/components/Hero";
import JewelArt from "@/components/JewelArt";
import { ArrowRight, CheckIcon } from "@/components/Icons";
import PromiseStrip from "@/components/PromiseStrip";
import OfferBanners from "@/components/OfferBanners";
import InstagramSection from "@/components/InstagramSection";
import { CategorySection, DivineSection, OccasionSection, ProductSection } from "@/components/HomeSections";
import { trust } from "@/lib/data";

export default function Home() {
  return (
    <main id="main">
      <Hero />

      <PromiseStrip />

      <OfferBanners />

      <CategorySection />

      <ProductSection id="best-h" title="The pieces everyone comes back for" view="Bestseller" href="/shop/bestsellers" cta="View all bestsellers" limit={8} />

      <DivineSection />

      <OccasionSection />

      <ProductSection id="new-h" title="Just arrived" sub="Fresh designs for everyday elegance." view="New" href="/shop/new-arrivals" cta="View all new arrivals" limit={4} />

      {/* Brand story */}
      <section className="story" aria-labelledby="story-h">
        <div className="wrap story-grid">
          <div className="story-art" aria-hidden="true">
            <div className="story-frame" data-parallax="0.08">
              <JewelArt kind="lakshmi" tone="gold" className="fill" />
            </div>
            <div className="story-frame small" data-parallax="0.22">
              <JewelArt kind="necklace" tone="ivory" className="fill" />
            </div>
          </div>
          <div className="story-copy">
            <h2 className="h2" id="story-h" data-split>Made with care. Worn with meaning.</h2>
            <p data-reveal>
              Only For Her began with a simple idea: jewellery should feel like you, and carry what you hold dear.
              Our designs draw on Indian devotion and tradition, shaped into pieces light enough for every day.
            </p>
            <ul className="ticks" data-stagger>
              <li><CheckIcon /> Designs inspired by faith, culture and craft</li>
              <li><CheckIcon /> Detail-checked finishing on every piece</li>
              <li><CheckIcon /> Materials chosen for comfort and lasting shine</li>
            </ul>
            <div data-reveal>
              <Link href="/about" className="btn btn-wine" data-magnetic>Discover our story <ArrowRight /></Link>
            </div>
          </div>
        </div>
      </section>

      {/* Why shop with us */}
      <section className="section wrap trust2" aria-labelledby="why-h">
        <h2 className="h2" id="why-h" data-split>Shop with confidence</h2>
        <ul className="trust-list" data-stagger>
          {trust.map((t) => (
            <li key={t.title}>
              <h3>{t.title}</h3>
              <p>{t.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <InstagramSection />
    </main>
  );
}
