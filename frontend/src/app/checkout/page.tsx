import type { Metadata } from "next";
import CheckoutView from "@/components/CheckoutView";

export const metadata: Metadata = {
  title: "Checkout | Only For Her",
  robots: { index: false },
};

export default function CheckoutPage() {
  return (
    <main id="main">
      <CheckoutView />
    </main>
  );
}
