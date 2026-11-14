import Link from "next/link";
import ShopClient from "./ShopClient";
import DivinePromo from "./DivinePromo";

const COPY = {
  all: { title: "Shop All Jewellery", desc: "Necklaces, earrings, rings and divine pendants, designed for everyday wear and the moments that matter.", crumb: "Shop" },
  bestsellers: { title: "Bestsellers", desc: "The pieces our customers come back for.", crumb: "Bestsellers" },
  new: { title: "New Arrivals", desc: "Fresh designs for everyday elegance.", crumb: "New Arrivals" },
} as const;

export default function ShopPage({ view }: { view: keyof typeof COPY }) {
  const c = COPY[view];
  return (
    <main id="main">
      <div className="wrap shop-top">
        <nav aria-label="Breadcrumb" className="crumbs">
          <ol>
            <li><Link href="/">Home</Link></li>
            {view !== "all" && <li><Link href="/shop">Shop</Link></li>}
            <li aria-current="page">{c.crumb}</li>
          </ol>
        </nav>
        <h1 className="h2 shop-title">{c.title}</h1>
        <p className="shop-desc">{c.desc}</p>
        {view === "all" && <DivinePromo />}
      </div>

      <div className="wrap">
        <ShopClient view={view} />
      </div>

      {view === "all" && (
        <section className="wrap seo" aria-labelledby="seo-h">
          <h2 id="seo-h" className="h2">Jewellery for every day and every blessing</h2>
          <p>
            Only For Her brings together contemporary jewellery and designs inspired by Indian tradition. Use the filters to
            narrow by collection, deity, material, plating, occasion or price. Our <Link href="/jewellery-care">jewellery care guide</Link> will
            help you keep your pieces shining.
          </p>
        </section>
      )}
    </main>
  );
}
