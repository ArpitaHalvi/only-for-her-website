import type { ReactElement, ReactNode } from "react";

/*
 * Turns the (function-component) element tree that JewelArt returns into an SVG
 * string, without react-dom/server (which Next does not allow in the app router).
 * Only supports what JewelArt uses: SVG host elements, function components,
 * fragments, arrays, text and numbers.
 */

const ATTR: Record<string, string> = { className: "class", htmlFor: "for" };
// viewBox and preserveAspectRatio keep their camelCase in SVG
const KEEP = new Set(["viewBox", "preserveAspectRatio"]);
const kebab = (s: string) => (ATTR[s] ?? (KEEP.has(s) ? s : s.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type El = ReactElement<Record<string, unknown>, string | ((p: Record<string, unknown>) => ReactNode)>;

export function toSvgString(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string") return esc(node);
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(toSvgString).join("");

  const el = node as El;
  const { type, props } = el;
  if (typeof type === "function") return toSvgString(type(props));
  if (typeof type !== "string") return toSvgString(props.children as ReactNode); // fragment

  const attrs = Object.entries(props)
    .filter(([k, v]) => k !== "children" && v !== undefined && v !== null && v !== false)
    .map(([k, v]) => ` ${kebab(k)}="${esc(String(v === true ? k : v))}"`)
    .join("");
  const children = toSvgString(props.children as ReactNode);
  return children ? `<${type}${attrs}>${children}</${type}>` : `<${type}${attrs}/>`;
}
