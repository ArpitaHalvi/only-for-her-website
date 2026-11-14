import type { Metadata } from "next";
import AuthView from "@/components/AuthView";

/* The backend redirects here (with ?error=...) when Google sign-in fails. */
export const metadata: Metadata = { title: "Sign in | Only For Her", robots: { index: false } };

export default function AuthPage() {
  return (
    <main id="main">
      <AuthView mode="login" />
    </main>
  );
}
