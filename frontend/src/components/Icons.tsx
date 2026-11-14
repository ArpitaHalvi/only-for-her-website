type P = { className?: string };
const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

export const SearchIcon = ({ className }: P) => (
  <svg {...base} className={className}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
export const UserIcon = ({ className }: P) => (
  <svg {...base} className={className}><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6" /></svg>
);
export const HeartIcon = ({ className, filled }: P & { filled?: boolean }) => (
  <svg {...base} className={className} fill={filled ? "currentColor" : "none"}><path d="M12 20.5s-8-4.7-8-11A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5c0 6.3-8 11-8 11Z" /></svg>
);
export const BagIcon = ({ className }: P) => (
  <svg {...base} className={className}><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
);
export const MenuIcon = ({ className }: P) => (
  <svg {...base} className={className}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);
export const CloseIcon = ({ className }: P) => (
  <svg {...base} className={className}><path d="m6 6 12 12M18 6 6 18" /></svg>
);
export const ChevronDown = ({ className }: P) => (
  <svg {...base} className={className}><path d="m6 9 6 6 6-6" /></svg>
);
export const ArrowLeft = ({ className }: P) => (
  <svg {...base} className={className}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
);
export const ArrowRight = ({ className }: P) => (
  <svg {...base} className={className}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const StarIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor"><path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2 6.3 20.3l1.2-6.4L2.8 9.5l6.4-.8L12 2.8Z" /></svg>
);
export const InstagramIcon = ({ className }: P) => (
  <svg {...base} className={className}><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r=".6" fill="currentColor" /></svg>
);
export const FacebookIcon = ({ className }: P) => (
  <svg {...base} className={className}><path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8.5c0-.3.2-.5.5-.5H14Z" /></svg>
);
export const PinterestIcon = ({ className }: P) => (
  <svg {...base} className={className}><circle cx="12" cy="12" r="9" /><path d="M10.5 20l1.8-7.5M9.5 13c-1-3 .8-6 3.5-6 2.2 0 3.3 1.600 3 3.400-.3 2-1.600 3.200-3 3.200-1 0-1.600-.7-1.400-1.600" /></svg>
);
export const YoutubeIcon = ({ className }: P) => (
  <svg {...base} className={className}><rect x="3" y="6" width="18" height="12" rx="4" /><path d="m10.500 9.500 4 2.500-4 2.500v-5Z" /></svg>
);
export const XIcon = ({ className }: P) => (
  <svg {...base} className={className}><path d="M4 4l16 16M20 4 4 20" /></svg>
);
export const LinkedinIcon = ({ className }: P) => (
  <svg {...base} className={className}><rect x="3.500" y="3.500" width="17" height="17" rx="3" /><path d="M8 10.500V16M8 7.800v.1M11.500 16v-5.500M11.500 13c0-1.500 1-2.500 2.300-2.500S16 11.500 16 13v3" /></svg>
);
export const WhatsappIcon = ({ className }: P) => (
  <svg {...base} className={className}><path d="M4 20l1.200-4A8 8 0 1 1 8 18.800L4 20Z" /><path d="M9 8.500c0 3.500 3 6.500 6.500 6.500l1-1.500-2-1-1 .8c-1-.4-2-1.400-2.400-2.400l.8-1-1-2L9 8.500Z" /></svg>
);
export const CheckIcon = ({ className }: P) => (
  <svg {...base} className={className}><path d="m5 12.500 4.500 4.500L19 7.500" /></svg>
);

const trustPaths: Record<string, React.ReactNode> = {
  quality: <><path d="M12 3l2.500 5 5.500.8-4 3.900.9 5.500L12 15.500 7.100 18.200 8 12.700 4 8.800 9.500 8 12 3Z" /></>,
  secure: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  returns: <><path d="M4 12a8 8 0 1 0 3-6.200" /><path d="M4 4v4h4" /></>,
  craft: <><path d="m12 3 9 6-9 12L3 9l9-6Z" /><path d="M3 9h18M9 9l3 12 3-12" /></>,
  delivery: <><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="17.500" r="1.800" /><circle cx="17" cy="17.500" r="1.800" /></>,
  support: <><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="14" width="4" height="6" rx="1.500" /><rect x="17" y="14" width="4" height="6" rx="1.500" /></>,
};
export const TrustIcon = ({ name, className }: { name: string; className?: string }) => (
  <svg {...base} className={className}>{trustPaths[name]}</svg>
);
