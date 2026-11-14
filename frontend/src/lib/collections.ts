import type { CatalogProduct, Category } from "./catalog";
import type { Tone } from "./data";

/*
 * Collection pages are built from what the shop has in the backend:
 *   type      each product category                       /category/<slug>
 *   divine    pieces with a deity / symbol, and one page per deity
 *   theme     collections created in the console
 *   occasion  every occasion that at least one product is tagged with
 * Nothing here lists a collection by hand.
 */

export type Group = "type" | "divine" | "theme" | "occasion";

export type Collection = {
  slug: string;
  name: string;
  group: Group;
  blurb: string;
  title: string;
  description: string;
  seo: string[];
  tone: Tone;
  image?: string;
  test: (p: CatalogProduct) => boolean;
  /** collections shown under the hero (deities on the divine page) */
  featured?: string[];
  related: string[];
};

export const GROUP_LABELS: Record<Group, string> = {
  type: "By jewellery type",
  divine: "Divine collection",
  theme: "Collections",
  occasion: "By occasion",
};

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const TONES: Tone[] = ["sand", "gold", "ivory", "wine"];
const tone = (i: number): Tone => TONES[i % TONES.length];
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

type BackendCollection = { name: string; slug: string; description?: string; image?: string; sortOrder: number };

export function buildCollections(products: CatalogProduct[], categories: Category[], backend: BackendCollection[]): Collection[] {
  const out: Collection[] = [];

  categories.forEach((c, i) => {
    const n = products.filter((p) => p.categorySlug === c.slug).length;
    out.push({
      slug: c.slug,
      name: c.name,
      group: "type",
      blurb: c.blurb || plural(n, "piece"),
      title: c.name,
      description: c.blurb || `${c.name} from Only For Her, designed for everyday wear and special moments.`,
      seo: [`Shop ${c.name.toLowerCase()} from Only For Her. Use the filters to narrow by collection, material, plating, occasion and price.`],
      tone: tone(i),
      image: c.image,
      test: (p) => p.categorySlug === c.slug,
      related: [],
    });
  });

  // divine: one page per deity / symbol that has products, plus the overview
  const deities = new Map<string, number>();
  products.forEach((p) => p.deity.forEach((d) => deities.set(d, (deities.get(d) ?? 0) + 1)));
  const deityList = [...deities.entries()].sort((a, b) => b[1] - a[1]);
  const divineBackend = backend.find((b) => b.slug === "divine");
  if (deityList.length || divineBackend) {
    out.push({
      slug: "divine",
      name: "Divine Collection",
      group: "divine",
      blurb: divineBackend?.description || "Faith, worn close",
      title: "Jewellery Inspired by Divinity",
      description: divineBackend?.description || "Explore jewellery inspired by Indian gods, goddesses and sacred symbols.",
      seo: ["Jewellery inspired by devotion and timeless Indian traditions. Choose a deity or symbol to see its collection, or browse everything here and filter by material and price."],
      tone: "wine",
      image: divineBackend?.image,
      test: (p) => p.deity.length > 0 || p.collections.includes(divineBackend?.name ?? "\u0000"),
      featured: deityList.map(([d]) => slugify(d)),
      related: [],
    });
  }
  deityList.forEach(([d], i) =>
    out.push({
      slug: slugify(d),
      name: d,
      group: "divine",
      blurb: plural(deities.get(d) ?? 0, "piece"),
      title: `${d} Jewellery`,
      description: `Jewellery inspired by ${d}, made to be worn close.`,
      seo: [`Our ${d} collection brings together jewellery inspired by ${d} and the traditions around devotion.`],
      tone: tone(i),
      test: (p) => p.deity.includes(d),
      related: [],
    }),
  );

  // themes created in the console
  backend
    .filter((b) => b.slug !== "divine")
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .forEach((b, i) =>
      out.push({
        slug: b.slug,
        name: `${b.name} Collection`,
        group: "theme",
        blurb: b.description || "",
        title: `${b.name} Jewellery`,
        description: b.description || `Explore the ${b.name.toLowerCase()} collection at Only For Her.`,
        seo: [`Explore the ${b.name.toLowerCase()} collection at Only For Her. Filter by material, plating, occasion and price.`],
        tone: tone(i + 1),
        image: b.image,
        test: (p) => p.collections.includes(b.name),
        related: [],
      }),
    );

  // occasions in use
  const occasions = new Map<string, number>();
  products.forEach((p) => p.occasions.forEach((o) => occasions.set(o, (occasions.get(o) ?? 0) + 1)));
  const taken = new Set(out.map((c) => c.slug));
  [...occasions.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([o], i) => {
      const slug = slugify(o);
      if (taken.has(slug)) return;
      taken.add(slug);
      out.push({
        slug,
        name: o,
        group: "occasion",
        blurb: plural(occasions.get(o) ?? 0, "piece"),
        title: o,
        description: `Jewellery chosen for ${o.toLowerCase()}.`,
        seo: [`Looking for jewellery for ${o.toLowerCase()}? Browse designs chosen for the occasion, and check our shipping and returns pages for delivery timelines before a big day.`],
        tone: tone(i + 2),
        test: (p) => p.occasions.includes(o),
        related: [],
      });
    });

  // "you may also like": a few from other groups
  out.forEach((c, i) => {
    c.related = out.filter((x, j) => j !== i && x.slug !== c.slug && (x.group !== c.group || c.group === "theme")).slice(0, 4).map((x) => x.slug);
  });
  return out;
}

export const bySlug = (list: Collection[], slug: string) => list.find((c) => c.slug === slug);
export const hrefOf = (c: Collection) => (c.group === "type" ? `/category/${c.slug}` : `/collections/${c.slug}`);
export const productsOf = (c: Collection, products: CatalogProduct[]) => products.filter(c.test);
