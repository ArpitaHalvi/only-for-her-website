import type { Metadata } from "next";
import WishlistView from "@/components/WishlistView";

export const metadata: Metadata = {
  title: "Wishlist | Only For Her",
  robots: { index: false },
};

export default function WishlistPage() {
  return (
    <main id="main">
      <WishlistView />
    </main>
  );
}
