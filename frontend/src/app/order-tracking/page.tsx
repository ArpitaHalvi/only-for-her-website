import { redirect } from "next/navigation";

/* Older links used /order-tracking; the tracking page lives at /track-order. */
export default function OrderTrackingRedirect() {
  redirect("/track-order");
}
