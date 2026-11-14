import JewelArt from "@/components/JewelArt";
import { toSvgString } from "@/lib/svgString";
import type { ArtKind, Tone } from "@/lib/data";

const KINDS = ["necklace", "earring", "ring", "bracelet", "pendant", "mangalsutra", "om", "ganesha", "shiva", "krishna", "lakshmi", "durga"];
const TONES = ["sand", "wine", "ivory", "gold"];

/**
 * The drawn jewellery as a standalone SVG file: /art/necklace/sand
 * Used as the product picture until real photographs are uploaded, and by the
 * product seed script (backend/scripts/seed-products.mjs).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ kind: string; tone: string }> }) {
  const { kind, tone } = await params;
  if (!KINDS.includes(kind) || !TONES.includes(tone)) return new Response("Not found", { status: 404 });

  const svg = toSvgString(JewelArt({ kind: kind as ArtKind, tone: tone as Tone })).replace(
    "<svg",
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"',
  );
  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}
