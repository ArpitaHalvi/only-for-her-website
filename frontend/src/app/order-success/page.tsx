import type { Metadata } from "next";
import OrderSuccessView from "@/components/OrderSuccessView";

export const metadata: Metadata = {
  title: "Order Confirmation | Only For Her",
  robots: { index: false },
};

export default function OrderSuccessPage() {
  return (
    <main id="main">
      <OrderSuccessView />
    </main>
  );
}
