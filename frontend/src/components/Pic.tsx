import JewelArt from "./JewelArt";
import type { ArtKind, Tone } from "@/lib/data";

/* eslint-disable @next/next/no-img-element */
/** A product picture: the real photograph when there is one, the drawn jewellery until then. */
export default function Pic({ src, alt = "", kind, tone, className, eager = false }: { src?: string; alt?: string; kind?: ArtKind; tone?: Tone; className?: string; eager?: boolean }) {
  if (src) return <img src={src} alt={alt} className={className} loading={eager ? "eager" : "lazy"} decoding="async" style={{ objectFit: "cover" }} />;
  return <JewelArt kind={kind} tone={tone} className={className} />;
}
