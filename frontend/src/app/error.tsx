"use client";

import Link from "next/link";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" className="page-white">
      <section className="wrap nf">
        <h1 className="nf-title">Something went wrong.</h1>
        <p className="nf-text">We hit a problem loading this page. Please try again.</p>
        <div className="nf-actions">
          <button className="btn btn-wine" onClick={reset}>Try again</button>
          <Link href="/" className="btn btn-outline">Back to home</Link>
        </div>
      </section>
    </main>
  );
}
