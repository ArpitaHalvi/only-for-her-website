"use client";

import Link from "next/link";

/** Shown while the catalogue is loading, or when the shop server could not be reached. */
export default function CatalogStatus({ loading = false }: { loading?: boolean }) {
  if (loading) return <main id="main" className="page-white"><div className="wrap" aria-busy="true" style={{ minHeight: 480 }} /></main>;
  return (
    <main id="main" className="page-white">
      <div className="wrap wl-empty">
        <h1 className="h3">We couldn&apos;t load the shop</h1>
        <p>Please check your connection and try again in a moment.</p>
        <button className="btn btn-wine btn-sq" onClick={() => window.location.reload()}>Try again</button>
        <p style={{ marginTop: 12 }}><Link href="/">Back to home</Link></p>
      </div>
    </main>
  );
}
