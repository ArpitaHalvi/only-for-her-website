import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Page not found | Only For Her", robots: { index: false } };

export default function NotFound() {
  return (
    <main id="main" className="page-white">
      <section className="wrap nf" aria-labelledby="nf-h">
        <p className="nf-code" aria-hidden="true">404</p>
        <h1 id="nf-h" className="nf-title">This page has wandered off.</h1>
        <p className="nf-text">The link may be old, or the page may have moved. Let&apos;s get you back to something beautiful.</p>
        <div className="nf-actions">
          <Link href="/" className="btn btn-wine">Back to home</Link>
          <Link href="/shop" className="btn btn-outline">Shop all jewellery</Link>
        </div>
        <ul className="nf-links">
          <li><Link href="/collections">Collections</Link></li>
          <li><Link href="/track-order">Track an order</Link></li>
          <li><Link href="/contact">Contact us</Link></li>
        </ul>
      </section>
    </main>
  );
}
