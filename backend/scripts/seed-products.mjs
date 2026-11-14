/**
 * Adds the starter catalogue (the 24 sample pieces the storefront shows) to the real database.
 *
 *   node scripts/seed-products.mjs --dry-run        show what would be added, change nothing
 *   node scripts/seed-products.mjs                  add them
 *   node scripts/seed-products.mjs --no-upload      skip Cloudinary: pictures are served by the storefront (/art/...). Only for trying things out
 *   node scripts/seed-products.mjs --update         also overwrite products whose SKU already exists
 *   node scripts/seed-products.mjs --art-url http://localhost:3000   where the storefront runs
 *
 * Safe to run twice: categories and collections are matched by name, products by SKU, and an
 * existing product is left alone unless --update is given. Nothing is ever deleted.
 *
 * Pictures: until real photographs exist, each product gets the drawn jewellery from the
 * storefront (/art/<kind>/<tone>) uploaded to Cloudinary. Replace them in the console
 * (Products > edit > images) as photographs arrive. The storefront must be running to serve the drawings
 * (cd frontend && npm run dev).
 *
 * Ratings and review counts are NOT seeded: they come from real customer reviews.
 * Stock is set to 25 per piece (0 where the sample says out of stock): adjust it in the console.
 */
import dns from "node:dns";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, "..");
const require = createRequire(path.join(backend, "package.json"));
require("dotenv").config({ path: path.join(backend, ".env"), quiet: true });

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const DRY = flag("--dry-run");
const UPDATE = flag("--update");
const NO_UPLOAD = flag("--no-upload"); // use the storefront's own drawings as the picture URLs (no Cloudinary needed)
const ART = opt("--art-url", "http://localhost:3000").replace(/\/$/, "");
const FOLDER = "only-for-her/products";

// ── The sample catalogue (the storefront's own list) ──────────────────────
const { catalog } = await import(pathToFileURL(path.resolve(backend, "../frontend/src/lib/catalog.ts")).href);

const DEITY = { Ganesha: "Lord Ganesha", Shiva: "Lord Shiva", Krishna: "Lord Krishna", Lakshmi: "Goddess Lakshmi", Durga: "Goddess Durga", Om: "Om" };
const OCCASION = { "Daily Wear": "Daily wear" };
// The sample lists "Silver" as a material; these are plated fashion pieces, so say what they are
const MATERIAL = { Silver: "Alloy" };
const PLATING = { "Gold-plated": "Gold plated", "Silver-plated": "Silver plated", "Rose Gold": "Rose gold plated" };
const CODE = { Necklaces: "NECK", Earrings: "EAR", Rings: "RING", Bracelets: "BRAC", Pendants: "PEND" };
const ALT_TONES = { sand: ["wine", "ivory"], wine: ["gold", "sand"], ivory: ["wine", "sand"], gold: ["wine", "ivory"] };

const sentence = (p) => {
  const bits = [`${p.name} in ${PLATING[p.plating] ?? p.plating} ${(MATERIAL[p.material] ?? p.material).toLowerCase()}`];
  const when = p.occasions.map((o) => OCCASION[o] ?? o).join(" and ").toLowerCase();
  return `${bits[0]}, made for ${when}.${p.deity ? ` Inspired by ${DEITY[p.deity] ?? p.deity}.` : ""}`;
};

const plan = catalog.map((p, i) => {
  const mrp = p.original ?? p.price;
  const n = String(catalog.filter((c, j) => j <= i && c.category === p.category).length).padStart(3, "0");
  return {
    sku: `OFH-${CODE[p.category] ?? "ITEM"}-${n}`,
    name: p.name,
    category: p.category,
    kind: p.kind,
    tone: p.tone,
    price: mrp,
    salePrice: p.original ? p.price : null,
    stock: p.inStock === false ? 0 : 25,
    collections: p.collections.map((c) => (c === "Divine" ? "Divine" : c)),
    deities: p.deity ? [DEITY[p.deity] ?? p.deity] : [],
    material: MATERIAL[p.material] ?? p.material,
    plating: PLATING[p.plating] ?? p.plating,
    occasion: p.occasions.map((o) => OCCASION[o] ?? o),
    style: p.style.find((s) => !/Women|Men|Unisex/.test(s)) ?? "",
    gender: p.style.includes("Unisex") ? "unisex" : "women",
    isBestseller: p.badge === "Bestseller",
    isNewArrival: p.badge === "New",
    description: sentence(p),
  };
});
const categories = [...new Set(plan.map((p) => p.category))];
const collections = [...new Set(plan.flatMap((p) => p.collections))];

console.log(`Catalogue: ${plan.length} products, ${categories.length} categories (${categories.join(", ")}), ${collections.length} collections (${collections.join(", ")}).`);
if (DRY) {
  console.table(plan.map((p) => ({ sku: p.sku, name: p.name, category: p.category, mrp: p.price, sale: p.salePrice, stock: p.stock, deity: p.deities.join(), flags: `${p.isBestseller ? "bestseller " : ""}${p.isNewArrival ? "new" : ""}` })));
  // Check every product against the real model rules (no database needed)
  const { default: Product } = await import(pathToFileURL(path.join(backend, "src/models/product.model.js")).href);
  const fake = "507f1f77bcf86cd799439011";
  const bad = plan.map((p) => ({ p, err: new Product({ category: fake, name: p.name, sku: p.sku, price: p.price, salePrice: p.salePrice, stock: p.stock, material: p.material, plating: p.plating, style: p.style, gender: p.gender, occasion: p.occasion, deities: p.deities, shortDescription: p.description, thumbnail: { url: "u", publicId: "p" } }).validateSync() })).filter((x) => x.err);
  console.log(bad.length ? `${bad.length} product(s) would be rejected: ${bad.map((b) => b.p.sku + " " + b.err.message).join("; ")}` : "All products pass the model rules.");
  console.log("Dry run: nothing was written. Run without --dry-run to add these.");
  process.exit(0);
}

// ── Connect (same DNS fallback the server uses for Atlas) ─────────────────
const { default: mongoose } = await import(pathToFileURL(path.join(backend, "node_modules/mongoose/index.js")).href);
try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
} catch (e) {
  console.log(`First connection attempt failed (${e.code || e.name}); retrying with public DNS...`);
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
  } catch (e2) {
    console.error(`\nCould not reach the database: ${e2.message.split("\n")[0]}`);
    console.error("If you use MongoDB Atlas: Network Access > add this computer's IP address (or your server's), then run again.");
    process.exit(1);
  }
}
const db = mongoose.connection;
console.log(`Connected to database "${db.name}".`);

const src = (f) => pathToFileURL(path.join(backend, "src", f)).href;
const { default: Product } = await import(src("models/product.model.js"));
const { default: ProductCategory } = await import(src("models/productCategory.model.js"));
const { default: Collection } = await import(src("models/collection.model.js"));
const { default: cloudinary } = await import(src("config/cloudinary.js"));

// ── Pictures ──────────────────────────────────────────────────────────────
async function drawing(kind, tone, publicId) {
  if (NO_UPLOAD) return { url: `${ART}/art/${kind}/${tone}`, publicId: `storefront/${kind}-${tone}` };
  const res = await fetch(`${ART}/art/${kind}/${tone}`);
  if (!res.ok) throw new Error(`The storefront did not return the drawing for ${kind}/${tone} (HTTP ${res.status}). Is it running at ${ART}?`);
  const file = path.join(os.tmpdir(), `${publicId.replace(/\W+/g, "_")}.svg`);
  fs.writeFileSync(file, await res.text());
  try {
    const up = await cloudinary.uploader.upload(file, { folder: FOLDER, public_id: publicId, overwrite: true, resource_type: "image" });
    return { url: up.secure_url, publicId: up.public_id };
  } finally {
    fs.rmSync(file, { force: true });
  }
}

// Fail early, before anything is written, if Cloudinary will not accept our credentials
if (!NO_UPLOAD) try {
  await cloudinary.api.ping();
} catch (e) {
  console.error(`\nCloudinary rejected the settings in backend/.env: ${e.error?.message || e.message}`);
  console.error("Open the Cloudinary dashboard, copy the Cloud name, API key and API secret exactly, put them in CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET, then run again.");
  console.error("Nothing was added to the database.");
  process.exit(1);
}

// Fail early, before anything is written, if the drawings are not reachable
await fetch(`${ART}/art/necklace/sand`).then((r) => {
  if (!r.ok) throw new Error(`Cannot reach the storefront at ${ART} (start it with: cd frontend && npm run dev).`);
});

// ── Categories and collections ────────────────────────────────────────────
const KIND_FOR = { Necklaces: "necklace", Earrings: "earring", Rings: "ring", Bracelets: "bracelet", Pendants: "pendant", Divine: "ganesha" };
const catId = new Map();
for (const [i, name] of categories.entries()) {
  let c = await ProductCategory.findOne({ name });
  if (!c) {
    c = await ProductCategory.create({ name, sortOrder: i, isActive: true, isFeatured: true, image: await drawing(KIND_FOR[name] ?? "pendant", "sand", `category-${name.toLowerCase()}`) });
    console.log(`  + category ${name}`);
  }
  catId.set(name, c._id);
}
const colId = new Map();
for (const [i, name] of collections.entries()) {
  let c = await Collection.findOne({ name });
  if (!c) {
    const kind = KIND_FOR[name] ?? plan.find((p) => p.collections.includes(name))?.kind ?? "necklace";
    const image = await drawing(kind, "wine", `collection-${name.toLowerCase().replace(/\s+/g, "-")}`);
    c = await Collection.create({ name, sortOrder: i, isActive: true, isFeatured: true, image });
    console.log(`  + collection ${name}`);
  }
  colId.set(name, c._id);
}

// ── Products ──────────────────────────────────────────────────────────────
let added = 0, updated = 0, skipped = 0;
for (const p of plan) {
  const existing = await Product.findOne({ sku: p.sku }).setOptions({ withDeleted: true });
  if (existing && !UPDATE) { skipped++; console.log(`  = ${p.sku} ${p.name} (already there, left alone)`); continue; }

  const base = p.sku.toLowerCase();
  const [t2, t3] = ALT_TONES[p.tone];
  const thumbnail = await drawing(p.kind, p.tone, `${base}-main`);
  const gallery = [await drawing(p.kind, t2, `${base}-2`), await drawing(p.kind, t3, `${base}-3`)];

  const data = {
    category: catId.get(p.category),
    name: p.name,
    sku: p.sku,
    price: p.price,
    salePrice: p.salePrice,
    stock: p.stock,
    isActive: true,
    isBestseller: p.isBestseller,
    isNewArrival: p.isNewArrival,
    shortDescription: p.description,
    description: p.description,
    material: p.material,
    plating: p.plating,
    style: p.style,
    gender: p.gender,
    occasion: p.occasion,
    deities: p.deities,
    collections: p.collections.map((c) => colId.get(c)),
    tags: [p.kind, p.category.toLowerCase()],
    thumbnail,
    gallery,
  };
  if (existing) {
    existing.set(data);
    await existing.save();
    updated++;
    console.log(`  ~ ${p.sku} ${p.name}`);
  } else {
    await new Product(data).save();
    added++;
    console.log(`  + ${p.sku} ${p.name}`);
  }
}

console.log(`\nDone. Added ${added}, updated ${updated}, left alone ${skipped}. Products in the database now: ${await Product.countDocuments()}.`);
await mongoose.disconnect();
