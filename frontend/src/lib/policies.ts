/*
 * Policy pages (privacy, shipping, terms, returns) are written in the console under Policies.
 * Nothing here is the policy text itself: we look for the matching policy by its address or
 * title and show it only if it exists and is active.
 */
import { API_URL } from "./auth";

export type PolicyKind = "privacy" | "shipping" | "terms" | "returns" | "about" | "faq" | "care";

export const POLICY_META: Record<PolicyKind, { title: string; path: string; slugs: string[]; match: RegExp; siteKey: string }> = {
  privacy: { title: "Privacy Policy", path: "/privacy-policy", slugs: ["privacy-policy", "privacy"], match: /privacy/i, siteKey: "privacy-policy" },
  shipping: { title: "Shipping Policy", path: "/shipping-policy", slugs: ["shipping-policy", "shipping", "delivery-policy"], match: /shipping|delivery/i, siteKey: "shipping-policy" },
  terms: { title: "Terms & Conditions", path: "/terms", slugs: ["terms-and-conditions", "terms-conditions", "terms"], match: /terms|conditions/i, siteKey: "terms-and-conditions" },
  about: { title: "About Us", path: "/about", slugs: ["about-us", "about"], match: /about/i, siteKey: "about-us" },
  faq: { title: "Frequently Asked Questions", path: "/faq", slugs: ["faq", "faqs", "frequently-asked-questions"], match: /faq|question/i, siteKey: "faq" },
  care: { title: "Jewellery Care Guide", path: "/jewellery-care", slugs: ["jewellery-care-guide", "jewellery-care", "care-guide"], match: /care/i, siteKey: "jewellery-care-guide" },
  returns: { title: "Returns & Refunds", path: "/returns-refunds", slugs: ["returns-and-refunds", "returns-refunds", "return-policy", "refund-policy", "returns"], match: /return|refund|exchange/i, siteKey: "return-policy" },
};

export type PolicyDoc = { title: string; html: string; faqs?: { question: string; answer: string }[] };

async function getJson(path: string) {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

/** The active policy for this page, or null when the shop has not written one. */
export async function loadPolicy(kind: PolicyKind): Promise<PolicyDoc | null> {
  const meta = POLICY_META[kind];
  try {
    const list = await getJson("/policy/public");
    const items: { title?: string; slug?: string }[] = list?.data ?? [];
    const hit =
      items.find((p) => p.slug && meta.slugs.includes(p.slug)) ??
      items.find((p) => meta.match.test(p.slug ?? "") || meta.match.test(p.title ?? ""));
    if (hit?.slug) {
      const one = await getJson(`/policy/public/slug/${encodeURIComponent(hit.slug)}`);
      const d = one?.data;
      if (d && typeof d.description === "string" && d.description.replace(/<[^>]*>|&nbsp;|\s/g, "").length > 0) {
        return { title: d.title || meta.title, html: d.description };
      }
    }
    // pages written under Website Pages
    const page = await getJson(`/site-pages/${meta.siteKey}`);
    const body = String(page?.data?.body ?? "");
    const faqs = Array.isArray(page?.data?.faqs) ? page.data.faqs : [];
    if (body.replace(/<[^>]*>|&nbsp;|\s/g, "").length > 0 || faqs.length > 0) {
      return { title: page.data.title || meta.title, html: body, faqs };
    }
  } catch {
    /* server unreachable: treated as not available */
  }
  return null;
}

/** Keeps the formatting an editor produces and drops anything that could run code. */
export function cleanHtml(html: string): string {
  if (typeof window === "undefined") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, iframe, object, embed, form, link, meta, base").forEach((n) => n.remove());
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const v = attr.value.trim().toLowerCase();
      if (attr.name.startsWith("on") || ((attr.name === "href" || attr.name === "src") && v.startsWith("javascript:"))) el.removeAttribute(attr.name);
    }
    if (el.tagName === "A") {
      el.setAttribute("rel", "noopener noreferrer");
    }
  });
  return doc.body.innerHTML;
}
