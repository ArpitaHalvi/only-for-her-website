/*
 * Shared types and a few fixed pieces of storefront wording.
 * Products, categories, collections, prices and contact details all come from the backend
 * (see lib/catalog.tsx and lib/config.tsx).
 */

export type ArtKind =
  | "necklace"
  | "earring"
  | "ring"
  | "bracelet"
  | "pendant"
  | "mangalsutra"
  | "om"
  | "ganesha"
  | "shiva"
  | "krishna"
  | "lakshmi"
  | "durga";

export type Tone = "sand" | "wine" | "ivory" | "gold";

export type Product = {
  id: string;
  name: string;
  price: number;
  original?: number;
  rating: number;
  reviews: number;
  badge?: "Bestseller" | "New";
  kind: ArtKind;
  tone: Tone;
  href: string;
  inStock?: boolean;
  /** photograph (first picture) and the one shown on hover; a drawing stands in when missing */
  image?: string;
  image2?: string;
};

export type NavItem = {
  label: string;
  href: string;
  links?: { label: string; href: string }[];
};

export const trust = [
  { icon: "quality", title: "Quality assured", text: "Every piece is checked before it leaves us." },
  { icon: "secure", title: "Secure payments", text: "Encrypted checkout with trusted gateways." },
  { icon: "returns", title: "Easy returns", text: "Changed your mind? Return within our policy window." },
  { icon: "craft", title: "Carefully crafted", text: "Designs shaped with detail and devotion." },
  { icon: "delivery", title: "Reliable delivery", text: "Tracked shipping, packed with care." },
  { icon: "support", title: "Dedicated support", text: "A real person to help before and after you buy." },
] as const;

/* Footer links. Each page behind them shows what is written in the console, or a "coming soon" page. */
export const footerColumns = [
  {
    title: "Customer Care",
    links: [
      { label: "Contact Us", href: "/contact" },
      { label: "FAQ", href: "/faq" },
      { label: "Track Your Order", href: "/track-order" },
      { label: "Jewellery Care Guide", href: "/jewellery-care" },
    ],
  },
  {
    title: "Policies",
    links: [
      { label: "Shipping Policy", href: "/shipping-policy" },
      { label: "Returns & Refunds", href: "/returns-refunds" },
      { label: "Privacy Policy", href: "/privacy-policy" },
      { label: "Terms & Conditions", href: "/terms" },
    ],
  },
  {
    title: "Information",
    links: [
      { label: "About Us", href: "/about" },
      { label: "My Account", href: "/account" },
      { label: "Wishlist", href: "/wishlist" },
    ],
  },
];

export const formatINR = (n: number) => "₹" + n.toLocaleString("en-IN");
