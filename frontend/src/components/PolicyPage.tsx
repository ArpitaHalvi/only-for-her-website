"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cleanHtml, loadPolicy, POLICY_META, type PolicyDoc, type PolicyKind } from "@/lib/policies";
import ContactLine from "./ContactLine";

/** Shows the policy written in the console; a calm placeholder page when there is none yet. */
export default function PolicyPage({ kind }: { kind: PolicyKind }) {
  const meta = POLICY_META[kind];
  const [doc, setDoc] = useState<PolicyDoc | null | undefined>(undefined);

  useEffect(() => {
    let stale = false;
    loadPolicy(kind).then((d) => {
      if (!stale) setDoc(d);
    });
    return () => {
      stale = true;
    };
  }, [kind]);

  return (
    <main id="main" className="page-white">
      <div className="wrap policy">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link> <span aria-hidden="true">›</span> <span aria-current="page">{doc?.title ?? meta.title}</span>
        </nav>

        {doc === undefined ? (
          <div aria-busy="true" style={{ minHeight: 360 }} />
        ) : doc ? (
          <article>
            <h1 className="policy-title">{doc.title}</h1>
            {doc.html && <div className="policy-body" dangerouslySetInnerHTML={{ __html: cleanHtml(doc.html) }} />}
            {doc.faqs && doc.faqs.length > 0 && (
              <div className="policy-faqs">
                {doc.faqs.map((f) => (
                  <details key={f.question}>
                    <summary>{f.question}</summary>
                    <p>{f.answer}</p>
                  </details>
                ))}
              </div>
            )}
          </article>
        ) : (
          <section className="policy-empty" aria-labelledby="pe-h">
            <h1 id="pe-h" className="policy-title">{meta.title}</h1>
            <p>This page is being prepared and will be available soon.</p>
            <p>If you have a question in the meantime, we are happy to help. <ContactLine /></p>
            <div className="policy-actions">
              <Link href="/shop" className="btn btn-wine">Continue shopping</Link>
              <Link href="/" className="hero-link">Back to home</Link>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
