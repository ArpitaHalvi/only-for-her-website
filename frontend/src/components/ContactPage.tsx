"use client";

import Link from "next/link";
import { useState } from "react";
import { API_URL } from "@/lib/auth";
import { addressLines, clean, telHref, useAppConfig, whatsappHref } from "@/lib/config";

const TOPICS = ["Order help", "Product question", "Returns & refunds", "Gifting", "Something else"];

const HELP = [
  { href: "/track-order", title: "Track an order", text: "See where your parcel is right now." },
  { href: "/return-policy", title: "Returns & refunds", text: "How to send a piece back." },
  { href: "/shipping-policy", title: "Shipping", text: "Delivery times and charges." },
  { href: "/faq", title: "FAQ", text: "Quick answers to common questions." },
];

/** A map link only when it is a real https address; the shop adds it in App Configuration. */
const safeUrl = (u?: string) => {
  try {
    const x = new URL(clean(u));
    return x.protocol === "https:" ? x.href : "";
  } catch {
    return "";
  }
};

/** Contact details come from App Configuration; messages go to the console under Contact. */
export default function ContactPage() {
  const { config } = useAppConfig();
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const [topic, setTopic] = useState(TOPICS[0]);

  const address = addressLines(config);
  const phone = clean(config?.phoneNumber);
  const email = clean(config?.email);
  const wa = whatsappHref(config);
  const map = safeUrl(config?.companyAddress?.find((a) => safeUrl(a.googleMapLocation))?.googleMapLocation);
  const social = [
    ["Instagram", safeUrl(config?.instagramLink)],
    ["Facebook", safeUrl(config?.facebookLink)],
    ["YouTube", safeUrl(config?.youtubeLink)],
  ].filter(([, href]) => href);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setState("sending");
    const f = new FormData(e.currentTarget);
    const order = String(f.get("order") ?? "").trim();
    try {
      const res = await fetch(`${API_URL}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "General",
          name: String(f.get("name") ?? "").trim(),
          email: String(f.get("email") ?? "").trim() || undefined,
          phone: String(f.get("phone") ?? "").trim(),
          subject: topic,
          message: String(f.get("message") ?? "").trim(),
          meta: { topic, ...(order ? { orderNumber: order } : {}) },
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message ?? "We couldn't send your message. Please try again.");
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't send your message.");
      setState("idle");
    }
  };

  return (
    <main id="main" className="page-white">
      <div className="wrap policy contact">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link> <span aria-hidden="true">›</span> <span aria-current="page">Contact Us</span>
        </nav>
        <h1 className="policy-title">We&apos;d love to hear from you</h1>
        <p className="contact-lede">Questions about an order, a piece or a gift? Choose the quickest way to reach us.</p>

        {(phone || wa || email) && (
          <ul className="contact-cards">
            {phone && (
              <li>
                <a href={telHref(phone)} className="contact-card">
                  <b>Call us</b>
                  <span>{phone}</span>
                </a>
              </li>
            )}
            {wa && (
              <li>
                <a href={wa} target="_blank" rel="noopener noreferrer" className="contact-card">
                  <b>WhatsApp</b>
                  <span>Chat with us</span>
                </a>
              </li>
            )}
            {email && (
              <li>
                <a href={`mailto:${email}`} className="contact-card">
                  <b>Email</b>
                  <span>{email}</span>
                </a>
              </li>
            )}
          </ul>
        )}

        <div className="contact-grid">
          <div className="contact-side">
            {address.length > 0 && (
              <section>
                <h2 className="contact-h">Visit us</h2>
                {address.map((a) => (
                  <p key={a}>{a}</p>
                ))}
                {map && (
                  <p>
                    <a href={map} target="_blank" rel="noopener noreferrer" className="contact-link">
                      Open in maps
                    </a>
                  </p>
                )}
              </section>
            )}

            <section>
              <h2 className="contact-h">Quick answers</h2>
              <ul className="contact-help">
                {HELP.map((h) => (
                  <li key={h.href}>
                    <Link href={h.href}>
                      <b>{h.title}</b>
                      <span>{h.text}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            {social.length > 0 && (
              <section>
                <h2 className="contact-h">Follow us</h2>
                <p className="contact-social">
                  {social.map(([name, href]) => (
                    <a key={name} href={href} target="_blank" rel="noopener noreferrer" className="contact-link">
                      {name}
                    </a>
                  ))}
                </p>
              </section>
            )}
          </div>

          {state === "sent" ? (
            <div role="status" className="contact-sent">
              <h2 className="contact-h">Thank you</h2>
              <p>We have your message and will reply as soon as we can. For anything urgent, call or WhatsApp us.</p>
              <Link href="/shop" className="btn btn-wine">Continue shopping</Link>
            </div>
          ) : (
            <form className="contact-form" onSubmit={submit}>
              <h2 className="contact-h">Send us a message</h2>
              <fieldset className="contact-topics">
                <legend>What is it about?</legend>
                {TOPICS.map((t) => (
                  <label key={t} className={t === topic ? "on" : ""}>
                    <input type="radio" name="topic" value={t} checked={t === topic} onChange={() => setTopic(t)} />
                    {t}
                  </label>
                ))}
              </fieldset>
              <div className="contact-row">
                <label>Name<input name="name" required maxLength={100} autoComplete="name" /></label>
                <label>Mobile number<input name="phone" required inputMode="tel" maxLength={15} autoComplete="tel" /></label>
              </div>
              <div className="contact-row">
                <label>Email (optional)<input name="email" type="email" autoComplete="email" /></label>
                {(topic === "Order help" || topic === "Returns & refunds") && (
                  <label>Order number (optional)<input name="order" maxLength={40} /></label>
                )}
              </div>
              <label>Message<textarea name="message" required rows={6} maxLength={2000} /></label>
              {error && <p className="auth-alert" role="alert">{error}</p>}
              <button className="btn btn-wine" type="submit" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send message"}</button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
