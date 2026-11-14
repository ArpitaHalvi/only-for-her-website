import type { Metadata } from "next";
import ShopPage from "@/components/ShopPage";

export const metadata: Metadata = {
  title: "Shop All Jewellery | Only For Her",
  description: "Browse necklaces, earrings, rings, bracelets and divine pendants. Filter by collection, deity, material, occasion and price.",
};

export default function Page() {
  return <ShopPage view="all" />;
}
