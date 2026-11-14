"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { BackendOrder } from "@/lib/account";
import { api } from "@/lib/auth";
import { OrderRow } from "./AccountBits";

export default function AccountOrders() {
  const [orders, setOrders] = useState<BackendOrder[] | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (p: number) => {
    try {
      const r = await api<{ data: BackendOrder[]; pagination: { totalPages: number } }>(`/orders/my?page=${p}&limit=10`, { auth: true });
      setOrders((prev) => (p === 1 ? r.data : [...(prev ?? []), ...r.data]));
      setPages(r.pagination.totalPages);
      setPage(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(1);
  }, [load]);

  return (
    <>
      <h1 className="acct-title">My Orders</h1>
      {error && <p className="auth-alert" role="alert">{error}</p>}
      {!orders && !error ? (
        <div aria-busy="true" style={{ minHeight: 200 }} />
      ) : orders && orders.length === 0 ? (
        <div className="acct-empty">
          <p>No orders yet.</p>
          <Link href="/shop" className="btn btn-wine btn-sq">Explore jewellery</Link>
        </div>
      ) : (
        orders && (
          <>
            <ul className="ord-list">{orders.map((o) => <OrderRow key={o._id} o={o} />)}</ul>
            {page < pages && (
              <div className="center">
                <button className="btn btn-outline btn-sq" disabled={loadingMore} onClick={() => { setLoadingMore(true); load(page + 1); }}>
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        )
      )}
    </>
  );
}
