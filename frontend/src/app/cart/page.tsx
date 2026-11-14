import type { Metadata } from "next";
import CartView from "@/components/CartView";

export const metadata: Metadata = {
  title: "Shopping Cart | Only For Her",
  robots: { index: false },
};

export default function CartPage() {
  return (
    <main id="main">
      <CartView />
    </main>
  );
}
