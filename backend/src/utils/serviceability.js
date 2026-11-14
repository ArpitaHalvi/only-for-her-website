import AppConfig from "../models/appConfig.model.js";
import ServiceArea from "../models/serviceArea.model.js";

export const PINCODE_RE = /^[1-9][0-9]{5}$/;

/**
 * Can we deliver to this PIN code, and is cash on delivery allowed there?
 * Returns { valid, serviceable, codAvailable, city, state, minDays, maxDays, message }.
 */
export async function checkPincode(pincode) {
  const pin = String(pincode ?? "").trim();
  if (!PINCODE_RE.test(pin)) return { valid: false, serviceable: false, codAvailable: false, message: "Please enter a valid 6 digit PIN code." };

  const [config, area] = await Promise.all([AppConfig.findOne().select("serviceabilityMode").lean(), ServiceArea.findOne({ pincode: pin }).lean()]);
  const listedOnly = config?.serviceabilityMode === "listed";

  if (!area) {
    return listedOnly
      ? { valid: true, pincode: pin, serviceable: false, codAvailable: false, message: "Sorry, we do not deliver to this PIN code yet." }
      : { valid: true, pincode: pin, serviceable: true, codAvailable: true };
  }
  if (!area.isServiceable) return { valid: true, pincode: pin, serviceable: false, codAvailable: false, city: area.city, state: area.state, message: area.note || "Sorry, we do not deliver to this PIN code yet." };
  return {
    valid: true,
    pincode: pin,
    serviceable: true,
    codAvailable: area.codAvailable !== false,
    city: area.city,
    state: area.state,
    minDays: area.minDays ?? undefined,
    maxDays: area.maxDays ?? undefined,
    message: area.codAvailable === false ? "Cash on delivery is not available for this PIN code." : undefined,
  };
}
