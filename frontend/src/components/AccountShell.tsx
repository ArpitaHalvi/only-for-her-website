"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ApiError, api, clearToken, getToken, type Customer } from "@/lib/auth";

type Ctx = { me: Customer; reload: () => Promise<void> };
const AccountCtx = createContext<Ctx | null>(null);
export const useAccount = () => {
  const v = useContext(AccountCtx);
  if (!v) throw new Error("useAccount must be used inside AccountShell");
  return v;
};

const LINKS = [
  { href: "/account", label: "Dashboard" },
  { href: "/account/orders", label: "My Orders" },
  { href: "/account/addresses", label: "My Addresses" },
  { href: "/account/wishlist", label: "My Wishlist" },
  { href: "/account/profile", label: "Profile Information" },
  { href: "/account/support", label: "Help & Support" },
];

export default function AccountShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [me, setMe] = useState<Customer | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!getToken()) {
      router.replace(`/login?next=${encodeURIComponent(path)}`);
      return;
    }
    try {
      const r = await api<{ data: Customer }>("/customer/me", { auth: true });
      setMe(r.data);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401 || err.status === 403) {
        // expired, invalid or blocked: end the session
        clearToken();
        router.replace(`/login?next=${encodeURIComponent(path)}`);
      } else setError(err.message);
    }
  }, [router, path]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!me) reload();
  }, [me, reload]);

  const logout = () => {
    clearToken();
    router.push("/login");
  };

  if (error)
    return (
      <div className="page-white"><div className="wrap acct"><p className="auth-alert" role="alert">{error}</p></div></div>
    );
  if (!me) return <div className="page-white"><div className="wrap acct" aria-busy="true" style={{ minHeight: 400 }} /></div>;

  const isActive = (href: string) => (href === "/account" ? path === "/account" : path.startsWith(href));

  return (
    <AccountCtx.Provider value={{ me, reload }}>
      <div className="page-white">
        <div className="wrap acct-layout">
          <aside className="acct-side">
            <div className="acct-welcome">
              <p>Welcome,</p>
              <h2>{me.name || "Customer"}</h2>
              <small>{me.email}</small>
            </div>
            <nav aria-label="Account">
              <ul>
                {LINKS.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} aria-current={isActive(l.href) ? "page" : undefined} className={isActive(l.href) ? "on" : ""}>
                      {l.label}
                    </Link>
                  </li>
                ))}
                <li><button onClick={logout}>Logout</button></li>
              </ul>
            </nav>
          </aside>
          <section className="acct-main">{children}</section>
        </div>
      </div>
    </AccountCtx.Provider>
  );
}
