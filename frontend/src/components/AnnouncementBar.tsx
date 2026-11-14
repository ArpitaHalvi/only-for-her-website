"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { promises } from "@/lib/config";
import { useAppConfig } from "@/lib/config";
import { CloseIcon } from "./Icons";

export default function AnnouncementBar() {
  const { config } = useAppConfig();
  const announcements = promises(config).map((text) => ({ text, href: undefined as string | undefined }));
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (paused || announcements.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % announcements.length), 4500);
    return () => clearInterval(t);
  }, [paused, announcements.length]);

  if (hidden || announcements.length === 0) return null;
  const a = announcements[i % announcements.length];

  return (
    <div
      className="announce"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <p key={i} className="announce-text" aria-live="polite">
        {a.href ? <Link href={a.href}>{a.text}</Link> : a.text}
      </p>
      <button className="announce-close" onClick={() => setHidden(true)} aria-label="Dismiss announcement">
        <CloseIcon />
      </button>
    </div>
  );
}
