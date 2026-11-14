import { API_URL, getToken } from "./auth";

/* Shapes returned by the backend (order.model.js, customer.model.js, customerAuth.controller.js). */

/** The backend sends pictures as { url, publicId }; older data may be a plain address. */
export type Img = string | { url?: string } | null | undefined;
export const imgUrl = (i: Img): string | undefined => (typeof i === "string" ? i : i?.url) || undefined;

export type OrderStatus = "pending" | "confirmed" | "processing" | "shipped" | "out_for_delivery" | "delivered" | "cancelled" | "return_requested" | "returned" | "refunded" | "failed";
export type PaymentStatus = "unpaid" | "paid" | "partially_refunded" | "refunded";

export type OrderItem = {
  product?: { _id: string; name: string; slug: string; thumbnail?: Img; gallery?: Img[] } | null;
  name: string;
  variantName?: string;
  sku?: string;
  image?: string;
  attributes?: Record<string, string>;
  price: number;
  quantity: number;
  lineTotal: number;
};

export type ShippingAddress = {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  country?: string;
  pincode: string;
};

export type TrackingEvent = { status: string; description?: string; location?: string; at: string };

export type BackendOrder = {
  _id: string;
  orderNo: string;
  createdAt: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  shippingCharge: number;
  codCharge: number;
  tax: number;
  taxMode: "inclusive" | "exclusive";
  totalAmount: number;
  couponCode?: string;
  shippingAddress: ShippingAddress;
  paymentMethod: "razorpay" | "cod";
  paymentStatus: PaymentStatus;
  paymentId?: string;
  paidAt?: string;
  status: OrderStatus;
  statusHistory: { status: OrderStatus; at: string; note?: string }[];
  trackingNumber?: string;
  courierName?: string;
  trackingUrl?: string;
  estimatedDelivery?: string;
  shipmentStatus?: string;
  trackingEvents: TrackingEvent[];
  deliveredAt?: string;
  cancelReason?: string;
  refundRequired?: boolean;
  invoice?: { number?: string };
};

export type SavedAddress = {
  _id: string;
  type: "home" | "office" | "someone_else" | "other";
  label: string;
  relation?: string;
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  country?: string;
  pincode: string;
  isDefault: boolean;
};

export type WishlistProduct = {
  _id: string;
  name: string;
  slug: string;
  price: number;
  salePrice?: number;
  thumbnail?: Img;
  gallery?: Img[];
  stock?: number;
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  return_requested: "Return requested",
  returned: "Returned",
  refunded: "Refunded",
  failed: "Payment failed",
};

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  paid: "Paid",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
};

export const SHIPMENT_LABEL: Record<string, string> = {
  label_created: "Shipment booked",
  picked_up: "Picked up",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  delivery_failed: "Delivery attempt failed",
  returned_to_origin: "Returning to us",
};

/** Statuses where a shipment is still on its way. */
export const ACTIVE_SHIPMENT: OrderStatus[] = ["processing", "shipped", "out_for_delivery"];

/** Backend rule: a customer can cancel until packing starts. */
export const canCancel = (o: BackendOrder) => ["pending", "confirmed"].includes(o.status);

export const itemImage = (it: OrderItem) => it.image || imgUrl(it.product?.thumbnail) || imgUrl(it.product?.gallery?.[0]);

export const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

/** Download a PDF that needs the sign-in token (a plain link can't send it). */
export async function downloadPdf(path: string, filename: string) {
  const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${getToken() ?? ""}` } });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.message ?? "Could not download the document.");
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
