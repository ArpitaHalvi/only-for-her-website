"use client";

import JewelArt from "./JewelArt";
import { InstagramIcon } from "./Icons";
import { clean, handleOf, useAppConfig } from "@/lib/config";
import type { ArtKind, Tone } from "@/lib/data";

const TILES: [ArtKind, Tone][] = [
  ["necklace", "sand"],
  ["ganesha", "wine"],
  ["earring", "ivory"],
  ["ring", "gold"],
  ["lakshmi", "sand"],
  ["bracelet", "wine"],
];

/** Shown only when the shop has set an Instagram link. */
export default function InstagramSection() {
  const { config } = useAppConfig();
  const url = clean(config?.instagramLink);
  if (!url) return null;
  const handle = handleOf(url);

  return (
    <section className="section wrap" aria-labelledby="ig-h">
      <header className="sec-head">
        <h2 className="h2" id="ig-h">Styled by you</h2>
        <p className="sub">{handle ? `Follow @${handle}` : "Follow us on Instagram"} for styling ideas and new drops.</p>
      </header>
      <ul className="ig-grid">
        {TILES.map(([k, t], n) => (
          <li key={n}>
            <a href={url} target="_blank" rel="noopener noreferrer" className="ig-tile" aria-label="View on Instagram">
              <JewelArt kind={k} tone={t} className="fill" />
              <span className="ig-hover"><InstagramIcon /></span>
            </a>
          </li>
        ))}
      </ul>
      <div className="center">
        <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-outline">
          <InstagramIcon /> Follow on Instagram
        </a>
      </div>
    </section>
  );
}
