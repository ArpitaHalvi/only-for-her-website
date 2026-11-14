import type { Metadata } from "next";
import AuthView from "@/components/AuthView";

export const metadata: Metadata = { title: "Sign in | Only For Her", robots: { index: false } };

export default function LoginPage() {
  return (
    <main id="main">
      <AuthView mode="login" />
    </main>
  );
}
