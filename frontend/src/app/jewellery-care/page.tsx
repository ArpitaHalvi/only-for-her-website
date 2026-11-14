import type { Metadata } from "next";
import PolicyPage from "@/components/PolicyPage";

export const metadata: Metadata = { title: "Jewellery Care Guide | Only For Her" };

export default function Page() {
  return <PolicyPage kind="care" />;
}
