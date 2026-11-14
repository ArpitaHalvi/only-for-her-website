import { API_URL } from "./auth";
import type { AppConfig } from "./config";

/* ---------- delivery check: answered by the shop's PIN code service ---------- */
export type DeliveryResult =
  | { ok: true; date: string; charge: number; cod: boolean; note?: string }
  | { ok: false; message: string };

export const checkPin = async (pin: string, orderValue: number, config: AppConfig | null): Promise<DeliveryResult> => {
  if (!/^[1-9]\d{5}$/.test(pin)) return { ok: false, message: "Enter a valid 6-digit PIN code." };
  let r: { valid?: boolean; serviceable?: boolean; codAvailable?: boolean; message?: string; maxDays?: number; minDays?: number };
  try {
    const res = await fetch(`${API_URL}/serviceability/${pin}`);
    const j = await res.json();
    if (!res.ok) return { ok: false, message: j.message ?? "Enter a valid 6-digit PIN code." };
    r = j.data;
  } catch {
    return { ok: false, message: "We couldn't check this PIN code right now. Please try again." };
  }
  if (!r.serviceable) return { ok: false, message: r.message ?? "Sorry, we don't deliver to this area yet." };

  const days = r.maxDays ?? r.minDays ?? 5;
  const d = new Date();
  d.setDate(d.getDate() + days);
  const free = config?.freeShippingAbove;
  return {
    ok: true,
    date: d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }),
    charge: free != null && orderValue >= free ? 0 : (config?.shippingCharge ?? 0),
    cod: r.codAvailable !== false && config?.codEnabled !== false,
    note: r.codAvailable === false ? r.message : undefined,
  };
};
