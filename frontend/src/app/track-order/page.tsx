import type { Metadata } from "next";
import TrackOrderView from "@/components/TrackOrderView";

export const metadata: Metadata = {
  title: "Track Your Order | Only For Her",
  description: "Follow your Only For Her order with your order number and the email or mobile number you used.",
};

export default function TrackOrderPage() {
  return (
    <main id="main">
      <TrackOrderView />
    </main>
  );
}
