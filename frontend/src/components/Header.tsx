"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCatalog } from "@/lib/catalog";
import { hrefOf } from "@/lib/collections";
import { formatINR, type NavItem } from "@/lib/data";
import { useStore } from "./StoreProvider";
import Logo from "./Logo";
import {
  BagIcon,
  ChevronDown,
  CloseIcon,
  HeartIcon,
  MenuIcon,
  SearchIcon,
  UserIcon,
} from "./Icons";

export default function Header() {
  const { cartCount, wishlist } = useStore();
  const { products, categories, collections } = useCatalog();

  // menus are built from the shop's own categories and collections
  const nav = useMemo<NavItem[]>(() => {
    const links = (group: string) => collections.filter((c) => c.group === group && c.slug !== "divine").map((c) => ({ label: c.name.replace(/ Collection$/, ""), href: hrefOf(c) }));
    const items: NavItem[] = [
      { label: "Home", href: "/" },
      {
        label: "Shop",
        href: "/shop",
        links: [
          { label: "All Products", href: "/shop" },
          { label: "New Arrivals", href: "/shop/new-arrivals" },
          { label: "Bestsellers", href: "/shop/bestsellers" },
        ],
      },
    ];
    if (categories.length) items.push({ label: "Jewellery", href: "/shop", links: categories.map((c) => ({ label: c.name, href: `/category/${c.slug}` })) });
    const divine = collections.find((c) => c.slug === "divine");
    if (divine) items.push({ label: "Divine Collection", href: "/collections/divine", links: links("divine") });
    const themes = [...links("theme"), ...links("occasion")];
    if (themes.length) items.push({ label: "Collections", href: "/collections", links: themes });
    items.push({ label: "About Us", href: "/about" });
    return items;
  }, [categories, collections]);
  const [scrolled, setScrolled] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [mobileOpen, setMobileOpen] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenMenu(null);
        setDrawer(false);
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = drawer ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawer]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const prods = products
      .filter((p) => p.name.toLowerCase().includes(term))
      .map((p) => ({ label: p.name, sub: formatINR(p.price), href: p.href }));
    const cats = categories
      .filter((c) => c.name.toLowerCase().includes(term))
      .map((c) => ({ label: c.name, sub: "Category", href: `/category/${c.slug}` }));
    return [...cats, ...prods].slice(0, 6);
  }, [q, products, categories]);

  return (
    <header className={`site-header${scrolled ? " is-scrolled" : ""}`}>
      <div className="header-inner">
        <button className="icon-btn menu-btn" onClick={() => setDrawer(true)} aria-label="Open menu">
          <MenuIcon />
        </button>

        <Link href="/" className="logo" aria-label="Only For Her, home">
          <Logo height={60} priority />
        </Link>

        <nav className="primary-nav" aria-label="Primary" onMouseLeave={() => setOpenMenu(null)}>
          {nav.map((item) => (
            <div
              key={item.label}
              className="nav-item"
              onMouseEnter={() => setOpenMenu(item.links ? item.label : null)}
            >
              <Link
                href={item.href}
                className="nav-link"
                aria-haspopup={item.links ? "true" : undefined}
                aria-expanded={item.links ? openMenu === item.label : undefined}
                onFocus={() => setOpenMenu(item.links ? item.label : null)}
              >
                {item.label}
                {item.links && <ChevronDown className="chev" />}
              </Link>
              {item.links && openMenu === item.label && (
                <div className="mega" onBlur={(e) => {
                  if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) setOpenMenu(null);
                }}>
                  <ul>
                    {item.links.map((l) => (
                      <li key={l.href + l.label}>
                        <Link href={l.href} onClick={() => setOpenMenu(null)}>{l.label}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="header-actions">
          <button className="icon-btn" onClick={() => setSearchOpen((s) => !s)} aria-label="Search" aria-expanded={searchOpen}>
            <SearchIcon />
          </button>
          <Link href="/account" className="icon-btn hide-sm" aria-label="Account">
            <UserIcon />
          </Link>
          <Link href="/wishlist" className="icon-btn" aria-label={`Wishlist, ${wishlist.length} items`}>
            <HeartIcon />
            {wishlist.length > 0 && <span className="count">{wishlist.length}</span>}
          </Link>
          <Link href="/cart" className="icon-btn" aria-label={`Shopping bag, ${cartCount} items`}>
            <BagIcon />
            {cartCount > 0 && <span className="count">{cartCount}</span>}
          </Link>
        </div>
      </div>

      {searchOpen && (
        <div className="search-panel">
          <form
            className="search-form"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) window.location.href = `/search?q=${encodeURIComponent(q.trim())}`;
            }}
          >
            <SearchIcon className="search-ico" />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search necklaces, Ganesha, earrings..."
              aria-label="Search products"
              autoComplete="off"
            />
            <button type="button" className="icon-btn" onClick={() => { setSearchOpen(false); setQ(""); }} aria-label="Close search">
              <CloseIcon />
            </button>
          </form>
          {q.trim() && (
            <ul className="suggest">
              {results.length === 0 && <li className="suggest-empty">No matches for “{q}”. Try “necklace” or “Ganesha”.</li>}
              {results.map((r) => (
                <li key={r.href}>
                  <Link href={r.href} onClick={() => setSearchOpen(false)}>
                    <span>{r.label}</span>
                    <small>{r.sub}</small>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* mobile drawer */}
      <div className={`drawer-scrim${drawer ? " on" : ""}`} onClick={() => setDrawer(false)} aria-hidden="true" />
      <aside className={`drawer${drawer ? " on" : ""}`} aria-label="Menu" aria-hidden={!drawer} inert={!drawer}>
        <div className="drawer-head">
          <span className="logo" aria-label="Only For Her"><Logo height={52} /></span>
          <button className="icon-btn" onClick={() => setDrawer(false)} aria-label="Close menu">
            <CloseIcon />
          </button>
        </div>
        <ul className="drawer-list">
          {nav.map((item) => (
            <li key={item.label}>
              {item.links ? (
                <>
                  <button
                    className="drawer-row"
                    aria-expanded={mobileOpen === item.label}
                    onClick={() => setMobileOpen(mobileOpen === item.label ? null : item.label)}
                  >
                    {item.label}
                    <ChevronDown className={`chev${mobileOpen === item.label ? " up" : ""}`} />
                  </button>
                  {mobileOpen === item.label && (
                    <ul className="drawer-sub">
                      {item.links.map((l) => (
                        <li key={l.href + l.label}>
                          <Link href={l.href} onClick={() => setDrawer(false)}>{l.label}</Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <Link href={item.href} className="drawer-row" onClick={() => setDrawer(false)}>{item.label}</Link>
              )}
            </li>
          ))}
          <li><Link href="/account" className="drawer-row" onClick={() => setDrawer(false)}>My Account</Link></li>
        </ul>
      </aside>
    </header>
  );
}
