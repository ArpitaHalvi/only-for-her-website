"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { saveToken } from "@/lib/auth";

/* The backend sends the Google sign-in token in the URL fragment (#token=...). Store it and clear the URL. */
export default function AuthCallback() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (!token) {
      setFailed(true);
      return;
    }
    saveToken(token, true);
    window.history.replaceState(null, "", window.location.pathname);
    router.replace("/account");
  }, [router]);

  return (
    <div className="page-white">
      <div className="wrap wl-empty">
        {failed ? (
          <>
            <h1 className="h3">We couldn&apos;t sign you in</h1>
            <Link href="/login" className="btn btn-wine btn-sq">Back to sign in</Link>
          </>
        ) : (
          <p role="status">Signing you in…</p>
        )}
      </div>
    </div>
  );
}
