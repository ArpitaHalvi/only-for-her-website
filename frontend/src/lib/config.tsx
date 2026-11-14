"use client";

/*
 * The shop's settings (App Configuration in the console): contact details, social links,
 * shipping and returns rules. Nothing like this is written into the storefront itself;
 * every page reads it from here. The last copy is kept in the browser so pages paint
 * instantly, then refreshed from the server.
 */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { API_URL } from "./auth";
import { formatINR } from "./data";

export type AppConfig = {
  appName?: string;
  phoneNumber?: string;
  email?: string;
  companyAddress?: { address?: string; googleMapLocation?: string }[];
  facebookLink?: string;
  instagramLink?: string;
  twitterLink?: string;
  youtubeLink?: string;
  linkedinLink?: string;
  whatsAppLink?: string;
  whatsappNumber?: string;
  whatsappMessage?: string;
  whatsappButtonEnabled?: boolean;
  shippingCharge?: number;
  freeShippingAbove?: number | null;
  codEnabled?: boolean;
  codCharge?: number;
  returnWindowDays?: number;
  giftWrapOptions?: { name: string; price: number; isActive?: boolean }[];
  serviceabilityMode?: "open" | "listed";
  seoTitle?: string;
  seoDescription?: string;
};

type Ctx = { config: AppConfig | null; loaded: boolean };
const ConfigCtx = createContext<Ctx>({ config: null, loaded: false });
const KEY = "ofh-config-v1";

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let stale = false;
    try {
      const raw = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setConfig(JSON.parse(raw));
    } catch {
      /* no saved copy */
    }
    fetch(`${API_URL}/app-config/public`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (stale || !j?.data) return;
        setConfig(j.data);
        try { localStorage.setItem(KEY, JSON.stringify(j.data)); } catch { /* ignore */ }
      })
      .catch(() => {
        /* offline or server down: keep the saved copy */
      })
      .finally(() => !stale && setLoaded(true));
    return () => {
      stale = true;
    };
  }, []);

  const value = useMemo(() => ({ config, loaded }), [config, loaded]);
  return <ConfigCtx.Provider value={value}>{children}</ConfigCtx.Provider>;
}

export const useAppConfig = () => useContext(ConfigCtx);

/* ---------- small helpers that turn settings into what a page shows ---------- */
export const clean = (s?: string | null) => (s ?? "").trim();

export const addressLines = (c: AppConfig | null) =>
  (c?.companyAddress ?? []).map((a) => clean(a.address)).filter(Boolean);

export const telHref = (phone?: string) => {
  const p = clean(phone).replace(/[^\d+]/g, "");
  return p ? `tel:${p}` : "";
};

export const whatsappHref = (c: AppConfig | null, text?: string) => {
  const direct = clean(c?.whatsAppLink);
  const num = clean(c?.whatsappNumber).replace(/\D/g, "");
  const msg = clean(text ?? c?.whatsappMessage);
  if (num) return `https://wa.me/${num}${msg ? `?text=${encodeURIComponent(msg)}` : ""}`;
  return direct;
};

/** Short promises for the top bar and the scrolling strip, built only from what the shop has set. */
export function promises(c: AppConfig | null): string[] {
  if (!c) return [];
  const out: string[] = [];
  if (c.freeShippingAbove != null && c.freeShippingAbove > 0) out.push(`Free shipping on orders above ${formatINR(c.freeShippingAbove)}`);
  else if (c.shippingCharge === 0) out.push("Free shipping on every order");
  if (c.codEnabled) out.push("Cash on delivery available");
  if ((c.returnWindowDays ?? 0) > 0) out.push(`Easy ${c.returnWindowDays}-day returns`);
  if (c.giftWrapOptions?.some((g) => g.isActive !== false)) out.push("Gift wrapping with your message");
  return out;
}

/** "https://instagram.com/name/" -> "name" (empty when it is only the site's home page) */
export const handleOf = (url?: string) => {
  try {
    const seg = new URL(clean(url)).pathname.split("/").filter(Boolean)[0];
    return seg ?? "";
  } catch {
    return "";
  }
};
