"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ArtKind, Tone } from "@/lib/data";
import Pic from "./Pic";
import { ArrowLeft, ArrowRight, CloseIcon } from "./Icons";

type Img = { label: string; src?: string; tone: Tone };

export default function ProductGallery({ images, name, kind }: { images: Img[]; name: string; kind?: ArtKind }) {
  const [i, setI] = useState(0);
  const [full, setFull] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState("50% 50%");
  const touch = useRef<number | null>(null);
  const n = images.length;
  const go = (k: number) => {
    setI((k + n) % n);
    setZoomed(false);
  };

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFull(false);
      if (e.key === "ArrowLeft") go(i - 1);
      if (e.key === "ArrowRight") go(i + 1);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full, i]);

  const swipe = {
    onTouchStart: (e: React.TouchEvent) => (touch.current = e.touches[0].clientX),
    onTouchEnd: (e: React.TouchEvent) => {
      if (touch.current === null) return;
      const dx = e.changedTouches[0].clientX - touch.current;
      touch.current = null;
      if (Math.abs(dx) > 40) go(dx < 0 ? i + 1 : i - 1);
    },
  };

  const cur = images[i];

  return (
    <div className="gallery">
      <ul className="thumbs" aria-label="Product images">
        {images.map((im, k) => (
          <li key={im.label}>
            <button className={k === i ? "on" : ""} onClick={() => go(k)} aria-label={`Show ${im.label}`} aria-current={k === i}>
              <Pic src={im.src} kind={kind} tone={im.tone} className="fill" />
            </button>
          </li>
        ))}
      </ul>

      <div className="stage" {...swipe}>
        <div
          className={`stage-img${zoomed ? " zoomed" : ""}`}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`);
          }}
          onMouseLeave={() => setZoomed(false)}
          onClick={() => setFull(true)}
          role="button"
          tabIndex={0}
          aria-label={`Open ${cur.label} of ${name} full screen`}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setFull(true)}
        >
          <div className="zoom-layer" style={{ transformOrigin: origin }}>
            <Pic src={cur.src} alt={`${name}: ${cur.label}`} kind={kind} tone={cur.tone} className="fill" eager />
          </div>
          <span className="img-label">{cur.label}</span>
        </div>
        <button className="zoom-btn" onClick={() => setZoomed((z) => !z)} aria-pressed={zoomed}>
          {zoomed ? "Zoom out" : "Zoom"}
        </button>
        <button className="g-arrow prev" onClick={() => go(i - 1)} aria-label="Previous image"><ArrowLeft /></button>
        <button className="g-arrow next" onClick={() => go(i + 1)} aria-label="Next image"><ArrowRight /></button>
        <p className="g-count" aria-live="polite">{i + 1} / {n}</p>
      </div>

      {full && createPortal(
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={`${name} images`} {...swipe}>
          <button className="lb-close icon-btn" onClick={() => setFull(false)} aria-label="Close full screen"><CloseIcon /></button>
          <button className="g-arrow prev" onClick={() => go(i - 1)} aria-label="Previous image"><ArrowLeft /></button>
          <div className="lb-img">
            <Pic src={cur.src} alt={`${name}: ${cur.label}`} kind={kind} tone={cur.tone} className="fill" eager />
            <span className="img-label">{cur.label}</span>
          </div>
          <button className="g-arrow next" onClick={() => go(i + 1)} aria-label="Next image"><ArrowRight /></button>
          <p className="g-count">{i + 1} / {n}</p>
        </div>,
        document.body,
      )}
    </div>
  );
}
