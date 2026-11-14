import type { Metadata } from "next";
import AuthCallback from "@/components/AuthCallback";

export const metadata: Metadata = { title: "Signing in | Only For Her", robots: { index: false } };

export default function CallbackPage() {
  return (
    <main id="main">
      <AuthCallback />
    </main>
  );
}
