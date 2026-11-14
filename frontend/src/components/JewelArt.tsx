import type { ArtKind, Tone } from "@/lib/data";

/*
 * Drawn jewellery, used wherever a product or category photograph is not
 * available yet. Every piece is flat shapes in the brand colours, set inside a
 * jharokha (arched window) so the whole shop shares one visual language.
 * When a real photograph exists, render it instead of <JewelArt>.
 */

type Pal = {
  bg: string; // wall
  arch: string; // the arch behind the piece
  metal: string; // the piece
  hi: string; // highlights on the metal
  stone: string; // set stones
  pearl: string;
  disc: string; // inside of a medallion
  em: string; // emblem drawn on a medallion
  spark: string;
};

const PAL: Record<Tone, Pal> = {
  sand: { bg: "#f1e8de", arch: "#ffffff", metal: "#b88636", hi: "#e9d197", stone: "#8a1a3c", pearl: "#fff8ef", disc: "#640f2b", em: "#e9d197", spark: "#b88636" },
  ivory: { bg: "#f7f2ec", arch: "#ffffff", metal: "#b88636", hi: "#ecd7a4", stone: "#7a1535", pearl: "#fff8ef", disc: "#640f2b", em: "#ecd7a4", spark: "#b88636" },
  gold: { bg: "#d8b16a", arch: "#ecd5a0", metal: "#640f2b", hi: "#9a3a58", stone: "#fff8ef", pearl: "#fff8ef", disc: "#fff2dc", em: "#640f2b", spark: "#fff2dc" },
  wine: { bg: "#640f2b", arch: "#7d1c3e", metal: "#d8b16a", hi: "#f3e0b3", stone: "#e0526f", pearl: "#fff8ef", disc: "#4a0a20", em: "#e9c98a", spark: "#d8b16a" },
};

const DEVANAGARI = "'Noto Sans Devanagari','Nirmala UI','Mangal','Kohinoor Devanagari',serif";

/** Dots along a path: used for beads on a chain */
const beads = (p: Pal, d: string, w = 8, gap = 13, color?: string) => (
  <path d={d} fill="none" stroke={color ?? p.metal} strokeWidth={w} strokeLinecap="round" strokeDasharray={`0.1 ${gap}`} />
);

const sparkle = (x: number, y: number, s: number, c: string) => (
  <path key={`${x}${y}`} transform={`translate(${x} ${y}) scale(${s})`} fill={c} d="M0-10C1 -4 4 -1 10 0 4 1 1 4 0 10-1 4-4 1-10 0-4-1-1-4 0-10Z" />
);

/** Emblems, drawn around (0,0) inside a circle of radius ~46 */
function Emblem({ kind, p }: { kind: ArtKind; p: Pal }) {
  const e = p.em;
  switch (kind) {
    case "om":
      return (
        <text x="0" y="22" textAnchor="middle" fontSize="78" fill={e} fontFamily={DEVANAGARI} fontWeight="600">
          ॐ
        </text>
      );
    case "ganesha":
      return (
        <g fill={e}>
          <path d="M-13-30 0-46 13-30Z" />
          <ellipse cx="-27" cy="-6" rx="15" ry="21" />
          <ellipse cx="27" cy="-6" rx="15" ry="21" />
          <ellipse cx="0" cy="-4" rx="17" ry="24" />
          <path d="M-6 10C-6 38 4 44 14 36 20 30 12 24 8 30 5 34 4 24 6 10Z" />
          <path d="M-12 12-20 30-14 28-9 14Z" fill={p.hi} />
          <circle cx="-7" cy="-10" r="2.6" fill={p.disc} />
          <circle cx="7" cy="-10" r="2.6" fill={p.disc} />
          <circle cx="0" cy="-22" r="2.4" fill={p.disc} />
        </g>
      );
    case "shiva":
      return (
        <g fill="none" stroke={e} strokeWidth="4.5" strokeLinecap="round">
          <path d="M0-44V46" />
          <path d="M-24-28C-24 2 24 2 24-28" />
          <path d="M0-48-7-34H7Z" fill={e} strokeWidth="1" />
          <path d="M-24-34-30-22H-18ZM24-34 18-22H30Z" fill={e} strokeWidth="1" />
          <path d="M-18 24H18M-14 32H14M-10 40H10" strokeWidth="3" />
        </g>
      );
    case "krishna":
      return (
        <g transform="scale(.82) translate(-2 4)">
          <path d="M-36 34 36-22" stroke={e} strokeWidth="8" strokeLinecap="round" />
          <circle cx="-14" cy="22" r="1.8" fill={p.disc} />
          <circle cx="-4" cy="14" r="1.8" fill={p.disc} />
          <circle cx="6" cy="7" r="1.8" fill={p.disc} />
          <path d="M18 40C12 18 14-6 26-30" fill="none" stroke={e} strokeWidth="3" strokeLinecap="round" />
          <ellipse cx="27" cy="-34" rx="13" ry="19" fill={e} transform="rotate(14 27 -34)" />
          <ellipse cx="27" cy="-34" rx="6.5" ry="10" fill={p.disc} transform="rotate(14 27 -34)" />
          <circle cx="27" cy="-34" r="3.2" fill={e} />
        </g>
      );
    case "lakshmi":
      return (
        <g fill={e} transform="scale(.82) translate(0 -2)">
          {[-62, -31, 0, 31, 62].map((r) => (
            <ellipse key={r} cx="0" cy="-8" rx="10.5" ry="31" transform={`rotate(${r} 0 38)`} opacity={r === 0 ? 1 : 0.92} />
          ))}
          <path d="M-38 44Q0 54 38 44" fill="none" stroke={e} strokeWidth="3.5" strokeLinecap="round" />
        </g>
      );
    case "durga":
      return (
        <g fill="none" stroke={e} strokeWidth="3.6" strokeLinejoin="round">
          <path d="M0-42 36 20H-36Z" />
          <path d="M0 42-36-20H36Z" />
          <circle r="7" fill={e} stroke="none" />
          {Array.from({ length: 16 }).map((_, i) => {
            const a = (i * Math.PI) / 8;
            return <circle key={i} cx={Math.cos(a) * 49} cy={Math.sin(a) * 49} r="2.2" fill={e} stroke="none" />;
          })}
        </g>
      );
    default:
      return <circle r="16" fill={p.stone} />;
  }
}

const DEITY_KINDS: ArtKind[] = ["om", "ganesha", "shiva", "krishna", "lakshmi", "durga"];

/** A round pendant on a chain */
function Medallion({ kind, p, cy = 318 }: { kind: ArtKind; p: Pal; cy?: number }) {
  const R = 74;
  return (
    <g>
      <path d="M92 96C100 250 160 250 200 244 240 250 300 250 308 96" fill="none" stroke={p.metal} strokeWidth="3" />
      {beads(p, "M110 100C122 214 168 236 200 238 232 236 278 214 290 100", 7, 15, p.hi)}
      <circle cx="200" cy="244" r="7" fill={p.metal} />
      <circle cx="200" cy={cy} r={R} fill={p.metal} />
      {Array.from({ length: 24 }).map((_, i) => {
        const a = (i * Math.PI) / 12;
        return <circle key={i} cx={200 + Math.cos(a) * (R - 6)} cy={cy + Math.sin(a) * (R - 6)} r="2.6" fill={p.hi} />;
      })}
      <circle cx="200" cy={cy} r={R - 16} fill={p.disc} />
      <g transform={`translate(200 ${cy})`}>
        <Emblem kind={kind} p={p} />
      </g>
    </g>
  );
}

function Jhumka({ cx, p }: { cx: number; p: Pal }) {
  return (
    <g>
      <circle cx={cx} cy="128" r="13" fill={p.metal} />
      <circle cx={cx} cy="128" r="6" fill={p.stone} />
      <path d={`M${cx} 141V170`} stroke={p.metal} strokeWidth="4" />
      <path d={`M${cx - 40} 250C${cx - 40} 206 ${cx - 20} 172 ${cx} 172S${cx + 40} 206 ${cx + 40} 250Z`} fill={p.metal} />
      <path d={`M${cx - 22} 246C${cx - 22} 214 ${cx - 10} 190 ${cx - 4} 180M${cx + 22} 246C${cx + 22} 214 ${cx + 10} 190 ${cx + 4} 180`} fill="none" stroke={p.hi} strokeWidth="3.4" strokeLinecap="round" />
      {[-34, -17, 0, 17, 34].map((d) => (
        <circle key={d} cx={cx + d} cy="252" r="8.5" fill={p.metal} />
      ))}
      <circle cx={cx} cy="206" r="8" fill={p.stone} />
      {[-30, -15, 0, 15, 30].map((d, i) => (
        <g key={d}>
          <path d={`M${cx + d} 258V${276 + (i % 2) * 8}`} stroke={p.metal} strokeWidth="2.4" />
          <circle cx={cx + d} cy={282 + (i % 2) * 8} r="7" fill={p.pearl} />
          <circle cx={cx + d - 2} cy={280 + (i % 2) * 8} r="2" fill="#fff" opacity=".9" />
        </g>
      ))}
    </g>
  );
}

function Piece({ kind, p }: { kind: ArtKind; p: Pal }) {
  if (DEITY_KINDS.includes(kind)) return <Medallion kind={kind} p={p} />;

  switch (kind) {
    case "necklace":
      return (
        <g>
          <path d="M84 104C90 300 310 300 316 104" fill="none" stroke={p.metal} strokeWidth="3.5" />
          {beads(p, "M110 106C118 262 282 262 290 106", 9, 17, p.hi)}
          <path d="M138 108C146 226 254 226 262 108" fill="none" stroke={p.metal} strokeWidth="3" />
          <path d="M200 262C174 296 174 332 200 332S226 296 200 262Z" fill={p.metal} />
          <path d="M200 270C186 292 186 318 200 322" fill="none" stroke={p.hi} strokeWidth="3" strokeLinecap="round" />
          <circle cx="200" cy="304" r="11" fill={p.stone} />
          <circle cx="197" cy="301" r="3" fill="#fff" opacity=".8" />
          <circle cx="200" cy="228" r="7" fill={p.metal} />
          {[-52, -26, 26, 52].map((d) => (
            <circle key={d} cx={200 + d} cy={d % 52 === 0 ? 250 : 258} r="5.5" fill={p.pearl} />
          ))}
        </g>
      );
    case "earring":
      return (
        <g>
          <Jhumka cx={132} p={p} />
          <Jhumka cx={268} p={p} />
        </g>
      );
    case "ring":
      return (
        <g>
          <ellipse cx="200" cy="318" rx="84" ry="92" fill="none" stroke={p.metal} strokeWidth="20" />
          <path d="M138 258C150 232 176 220 200 220" fill="none" stroke={p.hi} strokeWidth="4" strokeLinecap="round" opacity=".9" />
          <path d="M168 232 200 214 232 232 224 262H176Z" fill={p.metal} />
          <path d="M200 160 236 196 200 252 164 196Z" fill={p.pearl} />
          <path d="M164 196H236M200 160 184 196 200 252 216 196Z" fill="none" stroke={p.hi} strokeWidth="2.6" strokeLinejoin="round" />
          <path d="M150 160l8-8M250 160l-8-8M200 136v-12" stroke={p.hi} strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case "bracelet":
      return (
        <g>
          <ellipse cx="200" cy="316" rx="124" ry="50" fill="none" stroke={p.metal} strokeWidth="16" />
          <ellipse cx="200" cy="278" rx="124" ry="50" fill="none" stroke={p.metal} strokeWidth="16" />
          <path d="M92 270C100 242 150 226 200 226S300 242 308 270" fill="none" stroke={p.hi} strokeWidth="4" strokeLinecap="round" />
          {beads(p, "M88 322C96 360 150 374 200 374S304 360 312 322", 11, 22, p.stone)}
          <path d="M200 372V392" stroke={p.metal} strokeWidth="3" />
          <path d="M200 420c-22-16-30-26-30-38a15 15 0 0 1 30-2 15 15 0 0 1 30 2c0 12-8 22-30 38Z" fill={p.metal} />
          <path d="M184 392c4-6 10-6 14-2" fill="none" stroke={p.hi} strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case "mangalsutra":
      return (
        <g>
          <path d="M96 96C100 250 168 290 200 298 232 290 300 250 304 96" fill="none" stroke={p.metal} strokeWidth="3.5" />
          {beads(p, "M110 100C116 238 172 276 200 284 228 276 284 238 290 100", 11, 15, "#2a0a14")}
          {beads(p, "M110 100C116 238 172 276 200 284 228 276 284 238 290 100", 5, 15, p.hi)}
          <circle cx="200" cy="302" r="6" fill={p.metal} />
          <circle cx="178" cy="338" r="22" fill={p.metal} />
          <circle cx="222" cy="338" r="22" fill={p.metal} />
          <circle cx="178" cy="338" r="12" fill={p.stone} />
          <circle cx="222" cy="338" r="12" fill={p.stone} />
          <circle cx="178" cy="338" r="4.5" fill={p.hi} />
          <circle cx="222" cy="338" r="4.5" fill={p.hi} />
          <path d="M200 308V346" stroke={p.metal} strokeWidth="4" />
        </g>
      );
    default: // pendant
      return (
        <g>
          <path d="M104 98C112 200 168 236 200 246 232 236 288 200 296 98" fill="none" stroke={p.metal} strokeWidth="3" />
          {beads(p, "M120 102C128 190 172 222 200 230 228 222 272 190 280 102", 7, 14, p.hi)}
          <circle cx="200" cy="318" r="66" fill={p.metal} />
          <circle cx="200" cy="318" r="50" fill="none" stroke={p.hi} strokeWidth="3.4" />
          <circle cx="200" cy="318" r="22" fill={p.stone} />
          <circle cx="193" cy="311" r="6" fill="#fff" opacity=".75" />
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i * Math.PI) / 6;
            return <circle key={i} cx={200 + Math.cos(a) * 58} cy={318 + Math.sin(a) * 58} r="3.2" fill={p.hi} />;
          })}
        </g>
      );
  }
}

export default function JewelArt({
  kind = "pendant",
  tone = "sand",
  className,
  bare = false,
}: {
  kind?: ArtKind;
  tone?: Tone;
  className?: string;
  /** Round medal with just the emblem, for the deity menu */
  bare?: boolean;
}) {
  const p = PAL[tone];

  if (bare) {
    return (
      <svg className={className} viewBox="-100 -100 200 200" aria-hidden="true" focusable="false">
        <circle r="98" fill={p.metal} />
        {Array.from({ length: 36 }).map((_, i) => {
          const a = (i * Math.PI) / 18;
          return <circle key={i} cx={Math.cos(a) * 88} cy={Math.sin(a) * 88} r="2.8" fill={p.hi} />;
        })}
        <circle r="76" fill={p.disc} />
        <g transform="scale(1.34)">
          <Emblem kind={kind} p={p} />
        </g>
      </svg>
    );
  }

  return (
    <svg className={className} viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect width="400" height="500" fill={p.bg} />
      <path d="M52 500V206a148 148 0 0 1 296 0V500Z" fill={p.arch} />
      <path d="M84 500V210a116 116 0 0 1 232 0V500Z" fill={p.bg} opacity=".55" />
      {sparkle(70, 120, 1.2, p.spark)}
      {sparkle(334, 150, 0.9, p.spark)}
      {sparkle(318, 428, 1.1, p.spark)}
      <Piece kind={kind} p={p} />
    </svg>
  );
}
