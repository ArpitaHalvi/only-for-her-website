/**
 * bulkUpload.controller.js
 *
 * Bulk product upload from an Excel sheet plus a folder of images.
 *
 * Sheet layout (see console/public/templates/Product_Upload_Template.xlsx):
 *   row 1  banner / instructions
 *   row 2  column headers (a trailing * marks a required column)
 *   row 3  example row (its name starts with "[" and is ignored)
 *   row 4+ data
 *
 * One row = one variant. Rows that share the same product `sku` are merged
 * into a single product; product-level columns are read from its first row.
 * A product without variants uses a single row with the variant_* columns empty.
 *
 * Flow:
 *   1. multer keeps the Excel file and all images in memory
 *   2. parse the sheet with SheetJS
 *   3. validate every row and collect ALL errors before touching anything
 *   4. upload images to Cloudinary, building a filename -> {url, publicId} map
 *   5. group rows into products, assign slugs, validate each product document
 *   6. insert in batches of 500 with insertMany
 *   7. stream progress to the client as Server-Sent Events
 */

import XLSX from "xlsx";
import multer from "multer";
import Product from "../models/product.model.js";
import ProductCategory from "../models/productCategory.model.js";
import { uploadBufferToCloudinary } from "../utils/cloudinaryService.js";
import { slugify } from "../utils/slug.js";
import { isImageBuffer, isSpreadsheetBuffer } from "../utils/fileSignature.js";

const CLOUDINARY_FOLDER = "only-for-her/products";
const BATCH_SIZE = 500;
const GALLERY_COLUMNS = [
  "gallery1",
  "gallery2",
  "gallery3",
  "gallery4",
  "gallery5",
];
const IMAGE_COLUMNS = ["thumbnail", ...GALLERY_COLUMNS];
const FIRST_DATA_ROW = 4; // Excel row number of the first data row

// ─── Multer ───────────────────────────────────────────────────────────────────

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  // Files are held in memory, so every limit here bounds the memory one request can use
  limits: { fileSize: 10 * 1024 * 1024, files: 2001, fields: 20 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    const isExcel = file.fieldname === "excel" && /.(xlsx|xls)$/.test(name);
    const isImage =
      file.fieldname === "images" &&
      file.mimetype.startsWith("image/") &&
      /.(jpe?g|png|webp|gif)$/.test(name);
    cb(
      isExcel || isImage ? null : new Error(`Unsupported file: ${file.originalname}`),
      isExcel || isImage,
    );
  },
}).fields([
  { name: "excel", maxCount: 1 },
  { name: "images", maxCount: 2000 },
]);

// ─── Cell helpers ─────────────────────────────────────────────────────────────

const text = (value) => (value === undefined || value === null ? "" : String(value).trim());
const isBlank = (value) => text(value) === "";
const num = (value) => Number(text(value));
const isNumber = (value) => !isBlank(value) && !Number.isNaN(num(value));

/** TRUE / yes / 1 -> true, FALSE / no / 0 -> false, blank -> fallback */
function bool(value, fallback) {
  if (typeof value === "boolean") return value;
  const v = text(value).toLowerCase();
  if (["true", "yes", "y", "1"].includes(v)) return true;
  if (["false", "no", "n", "0"].includes(v)) return false;
  return fallback;
}

/** "size=12mm; color=red"  ->  { size: "12mm", color: "red" }  (null if malformed) */
function parseAttributes(value) {
  const out = {};
  const raw = text(value);
  if (!raw) return out;
  for (const pair of raw.split(/[;,]/)) {
    if (!pair.trim()) continue;
    const [key, ...rest] = pair.split("=");
    const attr = slugify(key);
    const val = rest.join("=").trim();
    if (!attr || !val) return null;
    out[attr] = val;
  }
  return out;
}

/** Strip the trailing * (required marker) that SheetJS keeps in header names. */
function normaliseKeys(row) {
  const clean = {};
  for (const [key, value] of Object.entries(row)) {
    clean[key.replace(/\s*\*+\s*$/, "").trim()] = value;
  }
  return clean;
}

const hasVariant = (row) =>
  ["variant_name", "variant_sku", "variant_price", "variant_salePrice", "variant_stock", "variant_attributes"].some(
    (key) => !isBlank(row[key]),
  );

// ─── Slugs ────────────────────────────────────────────────────────────────────

/**
 * insertMany does not run our pre-validate slug hook one document at a time,
 * and two products in the same batch could pick the same free slug. So slugs
 * are assigned here: query the DB once, then hand out -2, -3, ... for clashes
 * with the DB or with earlier products in this upload.
 */
async function assignSlugs(productDocs) {
  const bases = productDocs.map((d) => slugify(d.name) || "item");

  const existing = await Product.find({ slug: { $regex: `^(${[...new Set(bases)].map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(-\\d+)?$` } }, { slug: 1, _id: 0 })
    .setOptions({ withDeleted: true })
    .lean();

  const taken = new Set(existing.map((d) => d.slug));

  productDocs.forEach((doc, i) => {
    let candidate = bases[i];
    let counter = 2;
    while (taken.has(candidate)) candidate = `${bases[i]}-${counter++}`;
    taken.add(candidate);
    doc.slug = candidate;
  });
}

// ─── Row validation ───────────────────────────────────────────────────────────

function validateRow(row, excelRow, ctx) {
  const errors = [];
  const at = (msg) => errors.push(`Row ${excelRow}: ${msg}`);

  if (isBlank(row.name)) at("'name' is required.");
  if (isBlank(row.sku)) at("'sku' is required.");

  if (isBlank(row.category)) at("'category' is required.");
  else if (!ctx.categories.has(text(row.category).toLowerCase()))
    at(`Category "${row.category}" does not exist.`);

  if (!isNumber(row.price) || num(row.price) < 0)
    at("'price' must be a non-negative number.");
  if (!isBlank(row.salePrice)) {
    if (!isNumber(row.salePrice) || num(row.salePrice) < 0)
      at("'salePrice' must be a non-negative number.");
    else if (isNumber(row.price) && num(row.salePrice) >= num(row.price))
      at("'salePrice' must be lower than 'price'.");
  }
  if (!isBlank(row.stock) && (!isNumber(row.stock) || num(row.stock) < 0))
    at("'stock' must be a non-negative number.");

  if (hasVariant(row)) {
    if (isBlank(row.variant_name)) at("'variant_name' is required for a variant row.");
    if (isBlank(row.variant_sku)) at("'variant_sku' is required for a variant row.");
    if (!isBlank(row.variant_price) && (!isNumber(row.variant_price) || num(row.variant_price) < 0))
      at("'variant_price' must be a non-negative number.");
    if (!isBlank(row.variant_salePrice)) {
      const regular = isBlank(row.variant_price) ? row.price : row.variant_price;
      if (!isNumber(row.variant_salePrice) || num(row.variant_salePrice) < 0)
        at("'variant_salePrice' must be a non-negative number.");
      else if (isNumber(regular) && num(row.variant_salePrice) >= num(regular))
        at("'variant_salePrice' must be lower than its regular price.");
    }
    if (!isBlank(row.variant_stock) && (!isNumber(row.variant_stock) || num(row.variant_stock) < 0))
      at("'variant_stock' must be a non-negative number.");
    if (parseAttributes(row.variant_attributes) === null)
      at("'variant_attributes' must look like  size=12mm; color=red");
  }

  for (const column of IMAGE_COLUMNS) {
    const fname = text(row[column]);
    if (fname && !ctx.images[fname])
      at(`Image "${fname}" (column '${column}') was not found in the uploaded images folder.`);
  }

  return errors;
}

/** Checks that need to see the whole sheet or the database. */
async function validateAcrossRows(rows) {
  const errors = [];
  const seenProduct = new Map(); // product sku -> { name, excelRow }
  const seenVariant = new Map(); // variant sku -> excelRow

  rows.forEach((row, i) => {
    const excelRow = i + FIRST_DATA_ROW;
    const sku = text(row.sku);
    if (sku) {
      const first = seenProduct.get(sku);
      if (!first) seenProduct.set(sku, { name: text(row.name), excelRow });
      else if (first.name.toLowerCase() !== text(row.name).toLowerCase())
        errors.push(
          `Row ${excelRow}: sku "${sku}" is already used by "${first.name}" (row ${first.excelRow}). Each product needs its own sku.`,
        );
    }
    const vsku = text(row.variant_sku);
    if (vsku) {
      if (seenVariant.has(vsku))
        errors.push(`Row ${excelRow}: variant_sku "${vsku}" is repeated (also on row ${seenVariant.get(vsku)}).`);
      else seenVariant.set(vsku, excelRow);
    }
  });

  const productSkus = [...seenProduct.keys()];
  const variantSkus = [...seenVariant.keys()];

  const [existingProducts, existingVariants] = await Promise.all([
    Product.find({ sku: { $in: productSkus } }, { sku: 1, _id: 0 })
      .setOptions({ withDeleted: true })
      .lean(),
    Product.find({ "variants.sku": { $in: variantSkus } }, { "variants.sku": 1, _id: 0 })
      .setOptions({ withDeleted: true })
      .lean(),
  ]);

  for (const p of existingProducts)
    errors.push(`Product sku "${p.sku}" already exists in the database.`);
  const taken = new Set(existingVariants.flatMap((p) => p.variants.map((v) => v.sku)));
  for (const vsku of variantSkus)
    if (taken.has(vsku)) errors.push(`variant_sku "${vsku}" already exists in the database.`);

  return errors;
}

// ─── Rows -> product documents ────────────────────────────────────────────────

function rowToVariant(row) {
  return {
    name: text(row.variant_name),
    sku: text(row.variant_sku),
    price: isBlank(row.variant_price) ? null : num(row.variant_price),
    salePrice: isBlank(row.variant_salePrice) ? null : num(row.variant_salePrice),
    stock: isBlank(row.variant_stock) ? 0 : num(row.variant_stock),
    attributes: parseAttributes(row.variant_attributes) || {},
  };
}

function groupRowsIntoProducts(rows, cloudinaryMap, categoryMap) {
  const products = new Map();
  const image = (fname) => {
    const f = text(fname);
    return f && cloudinaryMap[f] ? cloudinaryMap[f] : null;
  };

  for (const row of rows) {
    const sku = text(row.sku);
    if (!products.has(sku)) {
      products.set(sku, {
        name: text(row.name),
        sku,
        category: categoryMap.get(text(row.category).toLowerCase()),
        price: num(row.price),
        salePrice: isBlank(row.salePrice) ? null : num(row.salePrice),
        stock: isBlank(row.stock) ? 0 : num(row.stock),
        isActive: bool(row.isActive, true),
        isFeatured: bool(row.isFeatured, false),
        shortDescription: text(row.shortDescription) || undefined,
        description: text(row.description) || undefined,
        metaTitle: text(row.metaTitle) || undefined,
        metaKeywords: text(row.metaKeywords) || undefined,
        metaDescription: text(row.metaDescription) || undefined,
        thumbnail: image(row.thumbnail),
        gallery: GALLERY_COLUMNS.map((c) => image(row[c])).filter(Boolean),
        variants: [],
      });
    }
    if (hasVariant(row)) products.get(sku).variants.push(rowToVariant(row));
  }

  return [...products.values()];
}

// ─── Batch insert ─────────────────────────────────────────────────────────────

async function insertBatch(batch, batchNum) {
  const insertedIds = [];
  const insertErrors = [];

  // Build + validate every document first so one bad product reports clearly
  // and does not stop the rest of the batch.
  const valid = [];
  for (const data of batch) {
    const doc = new Product(data);
    try {
      await doc.validate();
      valid.push(doc);
    } catch (err) {
      const reasons = err.errors
        ? Object.values(err.errors).map((e) => e.message).join(" ")
        : err.message;
      insertErrors.push(`Batch ${batchNum}: "${data.name}" (${data.sku}) — ${reasons}`);
    }
  }
  if (!valid.length) return { insertedIds, insertErrors };

  try {
    const result = await Product.insertMany(valid, { ordered: false });
    insertedIds.push(...result.map((p) => p._id));
  } catch (bulkErr) {
    const inserted = bulkErr.result?.insertedIds || bulkErr.insertedDocs || [];
    for (const item of Object.values(inserted)) {
      const id = item?._id ?? item;
      if (id) insertedIds.push(id);
    }
    const writeErrors = bulkErr.writeErrors || bulkErr.result?.writeErrors || [];
    if (writeErrors.length) {
      for (const we of writeErrors) {
        const idx = we.index ?? we.err?.index;
        const doc = valid[idx];
        const msg = we.errmsg || we.err?.errmsg || we.message || "Unknown error";
        const label = doc ? `"${doc.name}" (${doc.sku})` : `index ${idx}`;
        insertErrors.push(
          msg.includes("E11000")
            ? `Batch ${batchNum}: ${label} — duplicate sku, slug or variant sku.`
            : `Batch ${batchNum}: ${label} — ${msg}`,
        );
      }
    } else {
      insertErrors.push(`Batch ${batchNum}: ${bulkErr.message}`);
    }
  }

  return { insertedIds, insertErrors };
}

// ─── Main SSE controller ──────────────────────────────────────────────────────

export const bulkUploadProducts = async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (type, payload) => {
    res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
    if (typeof res.flush === "function") res.flush();
  };

  try {
    if (!req.files?.excel?.[0]) {
      send("error", {
        message: "No Excel file received. Please attach the template.",
      });
      return res.end();
    }

    // The file names and Content-Type are chosen by the uploader, so check the bytes
    if (!isSpreadsheetBuffer(req.files.excel[0].buffer)) {
      send("error", { message: "The Excel file is not a valid .xlsx / .xls file." });
      return res.end();
    }
    const badImage = (req.files?.images || []).find((f) => !isImageBuffer(f.buffer));
    if (badImage) {
      send("error", { message: `"${badImage.originalname}" is not a valid image file.` });
      return res.end();
    }

    send("progress", { message: "Files received. Parsing Excel…", percent: 5 });

    // Formulas, HTML and styles are not needed (and are the risky parts of a crafted file)
    const workbook = XLSX.read(req.files.excel[0].buffer, {
      type: "buffer",
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      bookVBA: false,
      sheetRows: 20000,
    });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    // range: 1 -> row 1 is the banner, row 2 holds the column headers
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "", range: 1 });

    const rows = rawRows.map(normaliseKeys).filter((r) => {
      const name = text(r.name);
      return name && !name.startsWith("[");
    });

    if (rows.length === 0) {
      send("error", {
        message:
          "The Excel file appears to be empty or contains only example rows.",
      });
      return res.end();
    }

    send("progress", {
      message: `Parsed ${rows.length} data row${rows.length !== 1 ? "s" : ""}. Loading categories…`,
      percent: 10,
    });

    // Categories can be written as a name or a slug.
    const categoryMap = new Map();
    for (const cat of await ProductCategory.find({ isActive: true }).select("_id name slug")) {
      categoryMap.set(cat.name.toLowerCase(), cat._id);
      categoryMap.set(cat.slug.toLowerCase(), cat._id);
    }

    const imageFileMap = {};
    for (const file of req.files?.images || [])
      imageFileMap[file.originalname] = file;

    send("progress", { message: "Validating all rows…", percent: 15 });

    const ctx = { categories: categoryMap, images: imageFileMap };
    const allErrors = [];
    rows.forEach((row, index) => {
      allErrors.push(...validateRow(row, index + FIRST_DATA_ROW, ctx));
    });
    allErrors.push(...(await validateAcrossRows(rows)));

    if (allErrors.length > 0) {
      send("validation_errors", {
        message: `Found ${allErrors.length} validation error${allErrors.length !== 1 ? "s" : ""}. Nothing was uploaded.`,
        errors: allErrors,
        percent: 15,
      });
      return res.end();
    }

    // Only upload the images the sheet actually uses.
    const used = new Set();
    for (const row of rows)
      for (const column of IMAGE_COLUMNS)
        if (text(row[column])) used.add(text(row[column]));
    const imageNames = [...used];

    send("progress", {
      message: `All ${rows.length} rows valid. Uploading ${imageNames.length} image${imageNames.length !== 1 ? "s" : ""} to Cloudinary…`,
      percent: 20,
    });

    const cloudinaryMap = {};
    for (let i = 0; i < imageNames.length; i++) {
      const file = imageFileMap[imageNames[i]];
      try {
        const result = await uploadBufferToCloudinary(file.buffer, {
          folder: CLOUDINARY_FOLDER,
          public_id: file.originalname.replace(/\.[^/.]+$/, ""),
        });
        cloudinaryMap[file.originalname] = {
          url: result.secure_url || result.url,
          publicId: result.public_id,
        };
      } catch (err) {
        send("error", {
          message: `Failed to upload image "${file.originalname}": ${err.message}`,
        });
        return res.end();
      }

      if ((i + 1) % 5 === 0 || i + 1 === imageNames.length) {
        send("progress", {
          message: `Uploaded ${i + 1} / ${imageNames.length} image${imageNames.length !== 1 ? "s" : ""}…`,
          percent: Math.round(20 + ((i + 1) / imageNames.length) * 40),
        });
      }
    }

    send("progress", { message: "Building product documents…", percent: 62 });

    const productDocs = groupRowsIntoProducts(rows, cloudinaryMap, categoryMap);

    send("progress", {
      message: `Generating unique slugs for ${productDocs.length} product${productDocs.length !== 1 ? "s" : ""}…`,
      percent: 63,
    });
    await assignSlugs(productDocs);

    send("progress", {
      message: `Built ${productDocs.length} product${productDocs.length !== 1 ? "s" : ""}. Saving to database in batches…`,
      percent: 65,
    });

    const allInsertedIds = [];
    const allInsertErrors = [];
    const totalBatches = Math.ceil(productDocs.length / BATCH_SIZE);

    for (let b = 0; b < totalBatches; b++) {
      const batch = productDocs.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
      const { insertedIds, insertErrors } = await insertBatch(batch, b + 1);

      allInsertedIds.push(...insertedIds);
      allInsertErrors.push(...insertErrors);

      send("progress", {
        message: `Saved batch ${b + 1} / ${totalBatches} (${insertedIds.length} saved${insertErrors.length ? `, ${insertErrors.length} failed` : ""})…`,
        percent: Math.round(65 + ((b + 1) / totalBatches) * 33),
      });
    }

    send("done", {
      message: "Bulk upload complete!",
      inserted: allInsertedIds.length,
      failed: allInsertErrors.length,
      errors: allInsertErrors,
      percent: 100,
    });
  } catch (err) {
    console.error("Bulk upload fatal error:", err);
    send("error", { message: "Unexpected server error. Please try again." });
  } finally {
    res.end();
  }
};
