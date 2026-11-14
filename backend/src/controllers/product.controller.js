import { DEITIES, OCCASIONS, withDefaults } from "../utils/jewellery.js";
import {
  uploadToCloudinary,
  destroyFromCloudinary,
} from "../utils/cloudinaryService.js";
import Product from "../models/product.model.js";
import Order from "../models/order.model.js";
import ProductCategory from "../models/productCategory.model.js";
import Collection from "../models/collection.model.js";
import { logMovements, notifyBackInStock } from "../services/inventoryService.js";

const CLOUDINARY_FOLDER = "only-for-her/products";

// Fields an admin can set through the body (create / put / patch).
const EDITABLE_FIELDS = [
  "category",
  "name",
  "slug",
  "sku",
  "hsnCode",
  "price",
  "salePrice",
  "stock",
  "isActive",
  "isFeatured",
  "isBestseller",
  "isNewArrival",
  "videos",
  "specifications",
  "isCustom",
  "isKids",
  "shortDescription",
  "description",
  "variants",
  "metaTitle",
  "metaKeywords",
  "metaDescription",
  // fashion-jewellery details
  "material",
  "plating",
  "color",
  "stoneType",
  "style",
  "occasion",
  "gender",
  "weightGrams",
  "dimensions",
  "isAntiTarnish",
  "isHypoallergenic",
  "careInstructions",
  "includedItems",
  "tags",
  "deities",
  "materialComposition",
  "warranty",
  "certificate",
  "collections",
  "returnable",
  "lowStockThreshold",
];

const LIST_FIELDS = ["occasion", "tags", "deities", "collections"];

const isObjectId = (value) => /^[0-9a-fA-F]{24}$/.test(value);

// Multipart forms send JSON and numbers as strings.
const parseJson = (value) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw Object.assign(new Error("A JSON field is not valid JSON."), {
      status: 400,
    });
  }
};

const emptyToNull = (value) =>
  value === "" || value === "null" || value === undefined ? null : value;

// A list can arrive as a JSON array, a comma separated string, or repeated form fields.
const parseList = (value) => {
  let list = value;
  if (typeof value === "string") {
    const t = value.trim();
    if (t.startsWith("[")) list = parseJson(t);
    else list = t ? t.split(",") : [];
  }
  if (!Array.isArray(list)) {
    throw Object.assign(new Error("A list field is not valid."), { status: 400 });
  }
  return [...new Set(list.map((v) => String(v).trim()).filter(Boolean))].slice(0, 30);
};

const pickFields = (body) => {
  const data = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] === undefined) continue;
    if (field === "variants") data.variants = parseJson(body.variants);
    else if (field === "salePrice") data.salePrice = emptyToNull(body.salePrice);
    else if (field === "weightGrams") data.weightGrams = emptyToNull(body.weightGrams);
    else if (field === "dimensions") data.dimensions = parseJson(body.dimensions);
    else if (field === "warranty" || field === "certificate") {
      const obj = parseJson(body[field]);
      if (obj !== null && (typeof obj !== "object" || Array.isArray(obj))) throw Object.assign(new Error(`${field} is not valid.`), { status: 400 });
      data[field] = obj ?? {};
      if (field === "certificate" && obj?.url && !/^https?:\/\//i.test(obj.url)) throw Object.assign(new Error("The certificate link must start with http:// or https://."), { status: 400 });
    }
    else if (field === "videos" || field === "specifications") {
      const list = parseJson(body[field]);
      if (!Array.isArray(list)) throw Object.assign(new Error(`${field} must be a list.`), { status: 400 });
      if (field === "videos") {
        data.videos = list.map((v) => (typeof v === "string" ? { url: v } : v)).filter((v) => v?.url);
        if (data.videos.some((v) => !/^https?:\/\//i.test(v.url))) throw Object.assign(new Error("A video link must start with http:// or https://."), { status: 400 });
      } else data.specifications = list.filter((s) => s?.label && s?.value);
    }
    else if (LIST_FIELDS.includes(field)) {
      const list = parseList(body[field]);
      if (field === "collections" && list.some((id) => !isObjectId(id))) {
        throw Object.assign(new Error("collections must be collection ids."), { status: 400 });
      }
      if (field !== "collections") {
        const tooLong = list.some((v) => v.length > 60);
        if (tooLong) throw Object.assign(new Error(`Each ${field} entry must be at most 60 characters.`), { status: 400 });
      }
      data[field] = list;
    } else data[field] = body[field];
  }
  return data;
};

// ── Stock changes made by editing a product are written to the stock ledger ──
const stockSnapshot = (product) => ({
  stock: product.stock,
  variants: new Map(product.variants.map((v) => [String(v._id), v.stock])),
});

async function logEditedStock(product, before, by) {
  const entries = [];
  let cameBack = false;
  const push = (delta, sku, variantId, previous) => {
    if (!delta) return;
    entries.push({ product: product._id, variantId, name: product.name, sku, delta, reason: "manual", by, note: "Edited on the product page" });
    if (previous <= 0 && previous + delta > 0) cameBack = true;
  };
  push(product.stock - before.stock, product.sku, null, before.stock);
  for (const v of product.variants) {
    const was = before.variants.get(String(v._id));
    if (was !== undefined) push(v.stock - was, v.sku, v._id, was);
    else if (v.stock > 0) push(v.stock, v.sku, v._id, 0); // new option
  }
  await logMovements(entries);
  if (cameBack) void notifyBackInStock(product._id);
}

const upload = async (file) => {
  const result = await uploadToCloudinary(
    file.path || file.buffer,
    CLOUDINARY_FOLDER,
  );
  return { url: result.secure_url || result.url, publicId: result.public_id };
};

const destroyAll = (images = []) =>
  Promise.all(
    images.filter(Boolean).map((img) => destroyFromCloudinary(img.publicId)),
  ).catch((err) => console.log("Old asset cleanup skip:", err.message));

// Files arrive as { thumbnail: [file], gallery: [file, ...] }.
const filesFrom = (req) => ({
  thumbnail: req.files?.thumbnail?.[0],
  gallery: req.files?.gallery || [],
});

const sendError = (res, error) => {
  if (error.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: Object.values(error.errors)
        .map((e) => e.message)
        .join(" "),
    });
  }
  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern || {})[0] || "field";
    return res.status(409).json({
      success: false,
      message: field.startsWith("variants.")
        ? "A variant with this SKU already exists."
        : `A product with this ${field} already exists.`,
    });
  }
  return res
    .status(error.status || 500)
    .json({ success: false, message: error.status && error.status < 500 ? error.message : "Internal Server Error" });
};

// @desc    Create a new product
// @route   POST /api/v1/products
// @access  Private/Admin
const createProduct = async (req, res) => {
  try {
    const { name, category, sku, price } = req.body;
    if (!name || !category || !sku || price === undefined || price === "") {
      return res.status(400).json({
        success: false,
        message: "Name, category, SKU and price are required fields.",
      });
    }

    const data = pickFields(req.body);
    const { thumbnail, gallery } = filesFrom(req);
    if (thumbnail) data.thumbnail = await upload(thumbnail);
    if (gallery.length) data.gallery = await Promise.all(gallery.map(upload));

    const product = await Product.create(data);
    await logEditedStock(product, { stock: 0, variants: new Map() }, req.user?.email || "admin");

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: product,
    });
  } catch (error) {
    console.error("[product.controller.js]", error.message);
    sendError(res, error);
  }
};

// @desc    Get all products with pagination and filtering
// @route   GET /api/v1/products
// @query   page, limit, search (name/sku, from the start of a word), match (several
//          phrases split by "|", any of them), category (id or
//          slug), featured, inStock, onSale, rated (has reviews),
//          custom (true = only custom products, false = leave them out),
//          kids (true = only products made for children),
//          minPrice, maxPrice (on the price paid),
//          sort (price-asc|price-desc|name|newest|rating|bestselling)
//          bestselling lists only products that have been ordered, most units first
// @access  Public
const getAllProducts = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const {
      search,
      match,
      category,
      featured,
      custom,
      kids,
      inStock,
      onSale,
      rated,
      minPrice,
      maxPrice,
      sort,
    } = req.query;

    const query = { isActive: true };

    // Jewellery filters: exact (case-insensitive) match; several values separated by commas
    const caseless = (value) =>
      String(value)
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
        .slice(0, 20)
        .map((v) => new RegExp(`^${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"));
    for (const [param, field] of [
      ["material", "material"],
      ["plating", "plating"],
      ["color", "color"],
      ["stone", "stoneType"],
      ["style", "style"],
      ["occasion", "occasion"],
      ["deity", "deities"],
      ["tag", "tags"],
    ]) {
      if (req.query[param]) query[field] = { $in: caseless(req.query[param]) };
    }
    if (req.query.gender) {
      const genders = String(req.query.gender).toLowerCase().split(",").map((g) => g.trim());
      query.gender = { $in: genders.filter((g) => ["women", "girls", "men", "unisex"].includes(g)) };
    }
    if (req.query.antiTarnish === "true") query.isAntiTarnish = true;
    if (req.query.hypoallergenic === "true") query.isHypoallergenic = true;
    if (req.query.collection) {
      const key = String(req.query.collection);
      const col = isObjectId(key)
        ? await Collection.findById(key).select("_id")
        : await Collection.findOne({ slug: key.toLowerCase() }).select("_id");
      query.collections = col ? col._id : { $in: [] }; // unknown collection -> no results
    }
    const and = []; // conditions that each need their own $or

    // Search: name, short description or SKU. Matches from the start of a word,
    // so "5 mukhi" finds "5 Mukhi Bead" but not "15 Mukhi Bead".
    // `match` is the same but takes several phrases separated by "|" and keeps
    // products matching ANY of them, e.g. match=5 Mukhi|7 Mukhi.
    const wordStart = (phrases) => {
      const escaped = phrases.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      const rx = { $regex: `(^|[^a-z0-9])(${escaped.join("|")})`, $options: "i" };
      return { $or: [{ name: rx }, { shortDescription: rx }, { sku: rx }] };
    };
    if (search) and.push(wordStart([String(search).trim()]));
    if (match) {
      const phrases = String(match)
        .split("|")
        .map((p) => p.trim())
        .filter(Boolean)
        .slice(0, 30);
      if (phrases.length) and.push(wordStart(phrases));
    }
    if (featured === "true") query.isFeatured = true;
    if (req.query.bestseller === "true") query.isBestseller = true;
    if (req.query.newArrival === "true") query.isNewArrival = true;
    if (custom === "true") query.isCustom = true;
    else if (custom === "false") query.isCustom = { $ne: true };
    if (kids === "true") query.isKids = true;
    // stock lives on the product, or on its variants when it has any
    if (inStock === "true")
      and.push({ $or: [{ stock: { $gt: 0 } }, { "variants.stock": { $gt: 0 } }] });
    if (onSale === "true") query.salePrice = { $ne: null };
    if (rated === "true") query.reviewCount = { $gt: 0 }; // has at least one review

    // category = id or slug; a parent category includes its sub-categories
    if (category) {
      const cat = isObjectId(category)
        ? await ProductCategory.findById(category)
        : await ProductCategory.findOne({ slug: String(category).toLowerCase() });
      const ids = [];
      if (cat) {
        const children = await ProductCategory.find({ parent: cat._id }).select("_id");
        ids.push(cat._id, ...children.map((c) => c._id));
      }
      query.category = { $in: ids }; // unknown category -> no results
    }

    // Price filters use what the customer pays (sale price when set)
    if (minPrice || maxPrice) {
      query.effectivePrice = {};
      if (minPrice) query.effectivePrice.$gte = Number(minPrice);
      if (maxPrice) query.effectivePrice.$lte = Number(maxPrice);
    }

    if (and.length) query.$and = and;

    const sortOptions = {
      "price-asc": { effectivePrice: 1 },
      "price-desc": { effectivePrice: -1 },
      name: { name: 1 },
      newest: { createdAt: -1 },
      rating: { rating: -1, reviewCount: -1 },
    };

    // Best sellers: rank products by units in orders that are not cancelled,
    // failed or returned, then apply the same filters as any other listing.
    if (sort === "bestselling") {
      const ranking = await Order.aggregate([
        { $match: { status: { $in: ["confirmed", "processing", "shipped", "out_for_delivery", "delivered"] } } },
        { $unwind: "$items" },
        { $group: { _id: "$items.product", sold: { $sum: "$items.quantity" } } },
        { $sort: { sold: -1 } },
      ]);
      const rank = new Map(ranking.map((r, i) => [String(r._id), i]));
      query._id = { $in: ranking.map((r) => r._id) };

      const matching = await Product.find(query).populate("category", "name slug");
      matching.sort((a, b) => rank.get(String(a._id)) - rank.get(String(b._id)));
      return res.status(200).json({
        success: true,
        message: "Products fetched successfully.",
        data: matching.slice((page - 1) * limit, page * limit),
        pagination: { total: matching.length, page, limit, totalPages: Math.ceil(matching.length / limit) },
      });
    }

    const total = await Product.countDocuments(query);
    const products = await Product.find(query)
      .populate("category", "name slug")
      .sort(sortOptions[sort] || { createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return res.status(200).json({
      success: true,
      message: "Products fetched successfully.",
      data: products,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("[product.controller.js]", error.message);
    res.status(500).json({
      success: false,
      message: "Internal Error",
    });
  }
};

// @desc    Admin list: like getAllProducts but includes inactive products and
//          searches name / sku with a plain substring match
// @route   GET /api/v1/products/admin/list
// @access  Private/Admin
const getAdminProducts = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const { search, category, status } = req.query;

    const query = {};
    if (search) {
      const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = { $regex: escaped, $options: "i" };
      query.$or = [{ name: rx }, { sku: rx }, { "variants.sku": rx }];
    }
    if (category) {
      if (!isObjectId(String(category))) {
        return res.status(400).json({ success: false, message: "Invalid category." });
      }
      query.category = category;
    }
    if (status === "active") query.isActive = true;
    if (status === "inactive") query.isActive = false;

    const total = await Product.countDocuments(query);
    const products = await Product.find(query)
      .populate("category", "name slug")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.status(200).json({
      success: true,
      data: products,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("[product.controller.js]", error.message);
    sendError(res, error);
  }
};

// @desc    Get single product by slug or ID
// @route   GET /api/v1/products/:slugOrId
// @access  Public
const getProductById = async (req, res) => {
  try {
    const { slugOrId } = req.params;
    const query = isObjectId(slugOrId) ? { _id: slugOrId } : { slug: slugOrId };

    const product = await Product.findOne(query).populate(
      "category",
      "name slug",
    );
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    res.status(200).json({ success: true, data: product });
  } catch (error) {
    console.error("[product.controller.js]", error.message);
    sendError(res, error);
  }
};

// @desc    Update a product (fields sent replace the stored ones)
// @route   PUT /api/v1/products/:id
// @access  Private/Admin
const updateProductFull = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    const stockBefore = stockSnapshot(product);
    product.set(pickFields(req.body));

    const { thumbnail, gallery } = filesFrom(req);
    const oldImages = [];
    if (thumbnail) {
      oldImages.push(product.thumbnail);
      product.thumbnail = await upload(thumbnail);
    }
    // Gallery: new uploads are appended. `keepGallery` (JSON array of
    // publicIds) lists the existing images to keep; the rest are removed.
    if (req.body.keepGallery !== undefined || gallery.length) {
      let existing = product.gallery.map((img) => img.toObject?.() ?? img);
      if (req.body.keepGallery !== undefined) {
        const keep = new Set(parseJson(req.body.keepGallery));
        oldImages.push(...existing.filter((img) => !keep.has(img.publicId)));
        existing = existing.filter((img) => keep.has(img.publicId));
      }
      product.gallery = [...existing, ...(await Promise.all(gallery.map(upload)))];
    }

    await product.save();
    await logEditedStock(product, stockBefore, req.user?.email || "admin");
    await destroyAll(oldImages); // only after the new data is safely saved

    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: product,
    });
  } catch (error) {
    console.error("[product.controller.js]", error.message);
    sendError(res, error);
  }
};

// @desc    Patch selected product fields
// @route   PATCH /api/v1/products/:id
// @access  Private/Admin
const patchProductPartial = async (req, res) => {
  try {
    if (req.body.thumbnail || req.body.gallery) {
      return res.status(400).json({
        success: false,
        message: "Use the PUT endpoint to change images.",
      });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    // Loaded + saved (not findByIdAndUpdate) so validation hooks run.
    const stockBefore = stockSnapshot(product);
    product.set(pickFields(req.body));
    await product.save();
    await logEditedStock(product, stockBefore, req.user?.email || "admin");

    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: product,
    });
  } catch (error) {
    console.error("[product.controller.js]", error.message);
    sendError(res, error);
  }
};

// @desc    Soft-delete a product (kept in the database, hidden everywhere)
// @route   DELETE /api/v1/products/:id
// @access  Private/Admin
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    // Images are kept so the product can be restored.
    product.deletedAt = new Date();
    product.isActive = false;
    await product.save();

    res
      .status(200)
      .json({ success: true, message: "Product deleted successfully" });
  } catch (error) {
    console.error("[product.controller.js]", error.message);
    sendError(res, error);
  }
};

// @desc    Values for the storefront filter sidebar (only what exists on active products)
// @route   GET /api/v1/products/filters
// @access  Public
const getProductFilters = async (req, res) => {
  try {
    const base = { $match: { isActive: true, deletedAt: null, isCustom: { $ne: true } } };
    const distinct = (field) => [
      { $match: { [field]: { $nin: [null, ""] } } },
      { $group: { _id: `$${field}`, count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 50 },
    ];
    const [facets] = await Product.aggregate([
      base,
      {
        $facet: {
          material: distinct("material"),
          plating: distinct("plating"),
          color: distinct("color"),
          stone: distinct("stoneType"),
          style: distinct("style"),
          gender: distinct("gender"),
          occasion: [{ $unwind: "$occasion" }, ...distinct("occasion")],
          deity: [{ $unwind: "$deities" }, ...distinct("deities")],
          price: [{ $group: { _id: null, min: { $min: "$effectivePrice" }, max: { $max: "$effectivePrice" } } }],
        },
      },
    ]);
    const list = (rows) => rows.map((r) => ({ value: r._id, count: r.count }));
    res.status(200).json({
      success: true,
      data: {
        material: list(facets.material),
        plating: list(facets.plating),
        color: list(facets.color),
        stone: list(facets.stone),
        style: list(facets.style),
        gender: list(facets.gender),
        occasion: withDefaults(list(facets.occasion), OCCASIONS),
        deity: withDefaults(list(facets.deity), DEITIES),
        price: facets.price[0] ? { min: facets.price[0].min, max: facets.price[0].max } : { min: 0, max: 0 },
      },
    });
  } catch (error) {
    console.error("[product.controller.js]", error.message);
    sendError(res, error);
  }
};

const CARD_FIELDS = "name slug thumbnail price salePrice effectivePrice rating reviewCount stock variants isBestseller isNewArrival isFeatured";
const idsFrom = (value, max) => {
  const ids = [...new Set(String(value ?? "").split(",").map((v) => v.trim()).filter(Boolean))];
  if (!ids.length || ids.length > max || !ids.every(isObjectId)) throw Object.assign(new Error(`ids must be 1 to ${max} product ids separated by commas.`), { status: 400 });
  return ids;
};

// @desc    Product cards for a list of ids (a guest's wishlist / recently viewed kept in the browser)
// @route   GET /api/v1/products/by-ids?ids=a,b,c   (up to 24; the order you ask for is kept)
const getProductsByIds = async (req, res) => {
  try {
    const ids = idsFrom(req.query.ids, 24);
    const rows = await Product.find({ _id: { $in: ids }, isActive: true, deletedAt: null }).select(CARD_FIELDS);
    const order = new Map(ids.map((id, i) => [id, i]));
    res.status(200).json({ success: true, data: rows.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id))) });
  } catch (error) {
    sendError(res, error);
  }
};

// @desc    Side-by-side comparison of up to 4 products
// @route   GET /api/v1/products/compare?ids=a,b,c
const compareProducts = async (req, res) => {
  try {
    const ids = idsFrom(req.query.ids, 4);
    const rows = await Product.find({ _id: { $in: ids }, isActive: true, deletedAt: null })
      .select(CARD_FIELDS + " shortDescription material plating color stoneType style gender weightGrams dimensions deities occasion isAntiTarnish isHypoallergenic includedItems careInstructions specifications materialComposition warranty returnable");
    const order = new Map(ids.map((id, i) => [id, i]));
    const products = rows.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id))).map((p) => {
      const o = p.toJSON();
      return { ...o, options: (p.variants || []).map((v) => v.name) };
    });
    // The rows the comparison table should show: only those where at least one product has a value
    const ROWS = [
      ["price", "Price"], ["salePrice", "Sale price"], ["material", "Material"], ["materialComposition", "Composition"], ["plating", "Plating / finish"],
      ["color", "Colour"], ["stoneType", "Stones"], ["style", "Style"], ["weightGrams", "Weight (g)"], ["dimensions", "Dimensions (mm)"],
      ["deities", "Deity"], ["occasion", "Occasions"], ["isAntiTarnish", "Anti-tarnish"], ["isHypoallergenic", "Hypoallergenic"],
      ["includedItems", "Includes"], ["options", "Options"], ["warranty", "Warranty"], ["rating", "Rating"],
    ];
    const has = (v) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length) && !(typeof v === "object" && !Array.isArray(v) && !Object.values(v).some((x) => x != null && x !== ""));
    const rowsToShow = ROWS.filter(([key]) => products.some((p) => has(p[key]))).map(([key, label]) => ({ key, label }));
    // Free-form specifications of any product, matched by label
    const specLabels = [...new Set(products.flatMap((p) => (p.specifications || []).map((s) => s.label)))];
    res.status(200).json({ success: true, data: { products, rows: rowsToShow, specifications: specLabels } });
  } catch (error) {
    sendError(res, error);
  }
};

// @desc    "You may also like": products sharing collections, category, tags or style
// @route   GET /api/v1/products/:slugOrId/related?limit=8
// @access  Public
const getRelatedProducts = async (req, res) => {
  try {
    const { slugOrId } = req.params;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 8, 1), 24);
    const product = await Product.findOne(isObjectId(slugOrId) ? { _id: slugOrId } : { slug: slugOrId });
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    const or = [{ category: product.category }];
    if (product.collections?.length) or.push({ collections: { $in: product.collections } });
    if (product.tags?.length) or.push({ tags: { $in: product.tags } });
    if (product.style) or.push({ style: product.style });

    const candidates = await Product.find({ _id: { $ne: product._id }, isActive: true, isCustom: { $ne: true }, $or: or })
      .populate("category", "name slug")
      .limit(80);

    const shared = (a = [], b = []) => a.filter((x) => b.map(String).includes(String(x))).length;
    const score = (p) =>
      shared(p.collections, product.collections) * 3 +
      (String(p.category?._id ?? p.category) === String(product.category) ? 2 : 0) +
      shared(p.tags, product.tags) +
      (product.style && p.style === product.style ? 1 : 0) +
      (p.inStock ? 2 : 0) + // sold-out items rank lower
      (p.rating || 0) / 5;
    candidates.sort((a, b) => score(b) - score(a));

    res.status(200).json({ success: true, data: candidates.slice(0, limit) });
  } catch (error) {
    console.error("[product.controller.js]", error.message);
    sendError(res, error);
  }
};

export {
  getProductFilters,
  getProductsByIds,
  compareProducts,
  getRelatedProducts,
  createProduct,
  getAllProducts,
  getAdminProducts,
  getProductById,
  updateProductFull,
  patchProductPartial,
  deleteProduct,
};
