import type { Metadata } from "next";
import PolicyPage from "@/components/PolicyPage";

export const metadata: Metadata = { title: "Returns & Refunds | Only For Her" };

export default function Page() {
  return <PolicyPage kind="returns" />;
}
