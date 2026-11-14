import type { Metadata } from "next";
import PolicyPage from "@/components/PolicyPage";

export const metadata: Metadata = { title: "Shipping Policy | Only For Her" };

export default function Page() {
  return <PolicyPage kind="shipping" />;
}
