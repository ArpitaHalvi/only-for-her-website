"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { API_URL, getToken } from "@/lib/auth";
import { CheckIcon, StarIcon } from "./Icons";

/* eslint-disable @next/next/no-img-element */
type Review = {
  _id: string;
  customerName: string;
  rating: number;
  title?: string;
  body: string;
  verified?: boolean;
  createdAt: string;
  photos?: { url: string }[];
  reply?: { text: string; by?: string };
};

const Stars = ({ n }: { n: number }) => (
  <span className="stars" role="img" aria-label={`${n} out of 5 stars`}>
    {Array.from({ length: 5 }).map((_, k) => (
      <StarIcon key={k} className={k < Math.round(n) ? "on" : "off"} />
    ))}
  </span>
);

const fmt = (d: string) =>
  new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/** Real customer reviews for a product, with a form for signed-in customers. */
export default function ProductReviews({
  productId,
  rating,
  total,
}: {
  productId: string;
  rating: number;
  total: number;
}) {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [stars, setStars] = useState(0);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  // Read in the browser only (false on the server); follows sign-in/out in other tabs.
  const signedIn = useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      return () => window.removeEventListener("storage", cb);
    },
    () => !!getToken(),
    () => false,
  );

  useEffect(() => {
    let stale = false;
    fetch(`${API_URL}/reviews/product/${productId}?limit=50`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => !stale && setReviews(Array.isArray(j?.data) ? j.data : []))
      .catch(() => !stale && setReviews([]));
    return () => {
      stale = true;
    };
  }, [productId]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    setError("");
    setState("sending");
    const fd = new FormData(form);
    fd.set("productId", productId);
    fd.set("rating", String(stars));
    try {
      const res = await fetch(`${API_URL}/reviews`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
        body: fd,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.success === false)
        throw new Error(
          j.message ?? "We couldn't send your review. Please try again.",
        );
      setState("sent");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "We couldn't send your review.",
      );
      setState("idle");
    }
  };

  const counts = [5, 4, 3, 2, 1].map((s) => ({
    stars: s,
    count: reviews?.filter((r) => r.rating === s).length ?? 0,
  }));
  const shown = reviews?.length ?? 0;

  return (
    <section className="pdp-sec" id="reviews" aria-labelledby="rv-h">
      <h2 id="rv-h" className="h3">
        Customer reviews
      </h2>
      <div className="rv-grid">
        <div className="rv-summary">
          {total > 0 ? (
            <>
              <p className="rv-score">{rating.toFixed(1)}</p>
              <Stars n={rating} />
              <p className="rv-total">
                {total} {total === 1 ? "review" : "reviews"}
              </p>
              {shown > 0 && shown === total && (
                <ul className="rv-bars">
                  {counts.map((d) => (
                    <li key={d.stars}>
                      <span>{d.stars}★</span>
                      <i>
                        <b style={{ width: `${(d.count / shown) * 100}%` }} />
                      </i>
                      <span>{d.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="rv-total">
              No reviews yet. Be the first to share what you think.
            </p>
          )}
        </div>

        <div>
          {reviews && reviews.length > 0 && (
            <ul className="rv-list">
              {reviews.map((r) => (
                <li key={r._id} className="rv">
                  <div className="rv-head">
                    <Stars n={r.rating} />
                    {r.verified && (
                      <span className="verified">
                        <CheckIcon /> Verified purchase
                      </span>
                    )}
                  </div>
                  {r.title && <h3>{r.title}</h3>}
                  <p>{r.body}</p>
                  {r.photos && r.photos.length > 0 && (
                    <div className="rv-photos" aria-label="Customer photos">
                      {r.photos.map((ph) => (
                        <img
                          key={ph.url}
                          src={ph.url}
                          alt="Customer photo"
                          className="rv-photo"
                          loading="lazy"
                        />
                      ))}
                    </div>
                  )}
                  <small>
                    {r.customerName} · {fmt(r.createdAt)}
                  </small>
                  {r.reply?.text && (
                    <p className="rv-reply">
                      <b>{r.reply.by || "Only For Her"}:</b> {r.reply.text}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="rv-form">
            <h3>Write a review</h3>
            {state === "sent" ? (
              <p role="status" className="rv-thanks">
                Thank you. Your review will appear once our team has approved
                it.
              </p>
            ) : !signedIn ? (
              <p>
                <Link
                  href={`/login?next=${encodeURIComponent(typeof window === "undefined" ? "/" : window.location.pathname)}`}
                >
                  Sign in
                </Link>{" "}
                to share your review of this piece.
              </p>
            ) : (
              <form onSubmit={submit}>
                <div
                  className="rate-pick"
                  role="radiogroup"
                  aria-label="Your rating"
                >
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      type="button"
                      key={s}
                      role="radio"
                      aria-checked={stars === s}
                      aria-label={`${s} star${s > 1 ? "s" : ""}`}
                      className={s <= stars ? "on" : ""}
                      onClick={() => setStars(s)}
                    >
                      <StarIcon />
                    </button>
                  ))}
                </div>
                <label>
                  Title
                  <input name="title" maxLength={120} />
                </label>
                <label>
                  Your review
                  <textarea name="body" required rows={4} maxLength={2000} />
                </label>
                <label>
                  Photos (optional, up to 3)
                  <input name="photos" type="file" accept="image/*" multiple />
                </label>
                {error && (
                  <p className="auth-alert" role="alert">
                    {error}
                  </p>
                )}
                <button
                  className="btn btn-wine"
                  type="submit"
                  disabled={stars === 0 || state === "sending"}
                >
                  {state === "sending" ? "Sending…" : "Submit review"}
                </button>
                {/* <p className="fine-dark">Reviews are checked by our team before they are published.</p> */}
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
