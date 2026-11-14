"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { defaultVariantId, useCatalog } from "@/lib/catalog";
import { getToken } from "@/lib/auth";
import { accountWishlist, accountWishlistAdd, accountWishlistMerge, accountWishlistRemove } from "@/lib/shop";

type WishItem = { id: string; savedPrice: number };
/** One line in the bag: a product (by its backend id) and, for products with options, the chosen option. */
export type CartLine = { key: string; id: string; variantId?: string; qty: number };
type Variant = { variantId?: string };

type Store = {
  /** false until saved state has been read from the browser */
  ready: boolean;
  lines: CartLine[];
  /** ids only, for quick lookups */
  wishlist: string[];
  wishItems: WishItem[];
  cartCount: number;
  addToCart: (id: string, qty?: number, variant?: Variant) => void;
  setQty: (key: string, qty: number) => void;
  removeLine: (key: string) => void;
  clearCart: () => void;
  moveLineToWishlist: (key: string) => void;
  toggleWish: (id: string) => void;
  removeWish: (id: string) => void;
};

const Ctx = createContext<Store | null>(null);
const KEY = "ofh-store-v3";

/*
 * The bag and wishlist, kept in this browser's localStorage so they survive navigation and reloads.
 * Signed in: the wishlist is also saved to the account and merged on sign-in.
 */
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { products, byId, ready: catalogReady, failed } = useCatalog();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [wishItems, setWishItems] = useState<WishItem[]>([]);
  const [ready, setReady] = useState(false);
  const wishRef = useRef<WishItem[]>([]);
  useEffect(() => {
    wishRef.current = wishItems;
  }, [wishItems]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const v = JSON.parse(raw);
        if (Array.isArray(v.lines)) setLines(v.lines);
        if (Array.isArray(v.wish)) setWishItems(v.wish);
      }
    } catch {
      /* storage unavailable: carry on with empty state */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ lines, wish: wishItems }));
    } catch {
      /* ignore */
    }
  }, [lines, wishItems, ready]);

  // once the catalogue is known, drop anything in the bag / wishlist that is no longer sold
  useEffect(() => {
    if (!ready || !catalogReady || failed || products.length === 0) return;
    setLines((ls) => {
      const ok = ls.filter((l) => byId(l.id));
      return ok.length === ls.length ? ls : ok;
    });
    setWishItems((w) => {
      const ok = w.filter((x) => byId(x.id));
      return ok.length === w.length ? w : ok;
    });
  }, [ready, catalogReady, failed, products, byId]);

  /** Mirrors a wishlist change to the signed-in customer's account (guests keep it in the browser only). */
  const syncWish = useCallback((id: string, on: boolean) => {
    const token = getToken();
    if (!token) return;
    (on ? accountWishlistAdd(token, id) : accountWishlistRemove(token, id)).catch(() => {
      /* the next sign-in merges whatever is missing */
    });
  }, []);

  /** On sign-in (and on load when already signed in): combine the browser's list with the account's. */
  const mergeWithAccount = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const theirs = (await accountWishlist(token)).data.filter(Boolean);
      const theirIds = new Set(theirs.map((t) => t._id));
      setWishItems((w) => {
        const have = new Set(w.map((x) => x.id));
        return [...w, ...theirs.filter((t) => !have.has(t._id)).map((t) => ({ id: t._id, savedPrice: 0 }))];
      });
      const missing = wishRef.current.map((x) => x.id).filter((id) => !theirIds.has(id));
      if (missing.length) await accountWishlistMerge(token, missing);
    } catch {
      /* offline or signed out: nothing to merge */
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    mergeWithAccount();
    window.addEventListener("ofh-auth", mergeWithAccount);
    return () => window.removeEventListener("ofh-auth", mergeWithAccount);
  }, [ready, mergeWithAccount]);

  const addToCart = useCallback(
    (id: string, qty = 1, variant?: Variant) => {
      const p = byId(id);
      const variantId = variant?.variantId ?? (p ? defaultVariantId(p) : undefined);
      const key = `${id}|${variantId ?? ""}`;
      setLines((ls) =>
        ls.some((l) => l.key === key) ? ls.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l)) : [...ls, { key, id, variantId, qty }],
      );
    },
    [byId],
  );

  const setQty = useCallback((key: string, qty: number) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, qty: Math.max(1, qty) } : l))), []);
  const removeLine = useCallback((key: string) => setLines((ls) => ls.filter((l) => l.key !== key)), []);
  const clearCart = useCallback(() => setLines([]), []);

  const toggleWish = useCallback(
    (id: string) => {
      const was = wishRef.current.some((x) => x.id === id);
      setWishItems((w) => (w.some((x) => x.id === id) ? w.filter((x) => x.id !== id) : [...w, { id, savedPrice: byId(id)?.price ?? 0 }]));
      syncWish(id, !was);
    },
    [syncWish, byId],
  );
  const removeWish = useCallback(
    (id: string) => {
      setWishItems((w) => w.filter((x) => x.id !== id));
      syncWish(id, false);
    },
    [syncWish],
  );

  const moveLineToWishlist = useCallback(
    (key: string) => {
      const line = lines.find((l) => l.key === key);
      if (!line) return;
      setWishItems((w) => (w.some((x) => x.id === line.id) ? w : [...w, { id: line.id, savedPrice: byId(line.id)?.price ?? 0 }]));
      setLines((ls) => ls.filter((l) => l.key !== key));
      syncWish(line.id, true);
    },
    [lines, syncWish, byId],
  );

  const value = useMemo<Store>(
    () => ({
      ready,
      lines,
      wishItems,
      wishlist: wishItems.map((w) => w.id),
      cartCount: lines.reduce((a, l) => a + l.qty, 0),
      addToCart,
      setQty,
      removeLine,
      clearCart,
      moveLineToWishlist,
      toggleWish,
      removeWish,
    }),
    [ready, lines, wishItems, addToCart, setQty, removeLine, clearCart, moveLineToWishlist, toggleWish, removeWish],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore must be used inside StoreProvider");
  return v;
}
