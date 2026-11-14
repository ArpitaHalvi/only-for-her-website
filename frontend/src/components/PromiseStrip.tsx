"use client";

import { promises, useAppConfig } from "@/lib/config";

/** The scrolling line of promises under the hero: built from the shop's shipping, COD and returns settings. */
export default function PromiseStrip() {
  const { config } = useAppConfig();
  const items = promises(config);
  if (items.length === 0) return null;
  // enough copies to fill any screen; the first half repeats exactly so the loop is seamless
  const loop = [...items, ...items, ...items, ...items];
  return (
    <div className="strip" data-marquee aria-label="Our promises">
      <ul className="strip-track">
        {loop.map((t, i) => (
          <li key={i} aria-hidden={i >= items.length}>
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 0c.8 6.500 5.500 11.200 12 12-6.500.8-11.200 5.500-12 12-.8-6.500-5.500-11.200-12-12C6.500 11.200 11.200 6.500 12 0Z" /></svg>
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}
