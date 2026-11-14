import type { Metadata } from "next";
import CollectionsIndex from "@/components/CollectionsIndex";

export const metadata: Metadata = {
  title: "Collections | Only For Her",
  description: "Browse jewellery by type, theme and occasion, including our divine collection.",
};

export default function CollectionsPage() {
  return <CollectionsIndex />;
}
