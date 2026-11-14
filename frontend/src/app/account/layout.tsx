import type { Metadata } from "next";
import AccountShell from "@/components/AccountShell";

export const metadata: Metadata = { title: "My Account | Only For Her", robots: { index: false } };

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main">
      <AccountShell>{children}</AccountShell>
    </main>
  );
}
