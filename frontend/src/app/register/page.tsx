import type { Metadata } from "next";
import AuthView from "@/components/AuthView";

export const metadata: Metadata = { title: "Create account | Only For Her", robots: { index: false } };

export default function RegisterPage() {
  return (
    <main id="main">
      <AuthView mode="register" />
    </main>
  );
}
