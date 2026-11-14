import type { Metadata } from "next";
import ContactPage from "@/components/ContactPage";

export const metadata: Metadata = { title: "Contact Us | Only For Her", description: "Get in touch with Only For Her." };

export default function Page() {
  return <ContactPage />;
}
