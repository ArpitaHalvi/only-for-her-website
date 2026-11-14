/**
 * Shipping providers.
 *
 * Today the shop ships by hand ("manual"): the admin types in the courier and
 * tracking number and moves the parcel along from the console. When a courier
 * API is available, add a provider below and set SHIPPING_PROVIDER to its name.
 * Nothing else in the order code has to change.
 *
 * A provider is an object with up to two functions:
 *
 *   createShipment(order) -> { courierName, trackingNumber, trackingUrl?, shipmentId?, estimatedDelivery? }
 *       Books the parcel with the courier. Called when an order is marked
 *       shipped without a tracking number.
 *
 *   fetchTracking(order) -> [{ status, description?, location?, at? }]
 *       Asks the courier where the parcel is. Used by "Refresh tracking" in
 *       the console. `status` is one of SHIPMENT_STATUSES.
 *
 * Couriers that push updates call POST /shipping/webhook (see shipping.routes.js)
 * with the same event shape, so no polling is needed for them.
 *
 * Example:
 *   providers.shiprocket = {
 *     async createShipment(order) { ...call the API... return { courierName, trackingNumber, shipmentId }; },
 *     async fetchTracking(order)  { ...call the API... return events; },
 *   };
 */

export { SHIPMENT_STATUSES } from "../models/order.model.js";

const providers = {
  // Entered by hand: nothing to call
  manual: {},
};

export const providerName = () => {
  const name = (process.env.SHIPPING_PROVIDER || "manual").toLowerCase();
  return providers[name] ? name : "manual";
};

export const getProvider = () => providers[providerName()];

/** Builds the page where the customer can follow the parcel, or "" if unknown. */
export function buildTrackingUrl({ trackingNumber, trackingUrl, template }) {
  if (trackingUrl) return trackingUrl;
  if (!trackingNumber || !template || !template.includes("{trackingNumber}")) return "";
  return template.replace("{trackingNumber}", encodeURIComponent(trackingNumber));
}

/** Only http(s) links are kept, so a stored link can never be a script. */
export const cleanUrl = (value) => {
  if (value == null) return undefined;
  const text = String(value).trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
};
