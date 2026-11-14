import Product from "../models/product.model.js";
import StockMovement, { STOCK_REASONS } from "../models/stockMovement.model.js";
import StockAlert from "../models/stockAlert.model.js";
import { logMovements, notifyBackInStock } from "../services/inventoryService.js";

const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const paging = (query, def = 20) => {
  const page = Math.min(Math.max(parseInt(query.page) || 1, 1), 10000);
  const limit = Math.min(Math.max(parseInt(query.limit) || def, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
};
const serverError = (res, err) => {
  console.error("inventory error:", err.message);
  return res.status(500).json({ success: false, message: "Internal Server Error" });
};

// ─── Admin ────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/inventory/low-stock
 * Products (or product options) at or below their lowStockThreshold, lowest first.
 * Query: page, limit, includeOut=false to hide items that are already at 0.
 */
export const getLowStock = async (req, res) => {
  try {
    const { page, limit, skip } = paging(req.query);
    const hideOut = req.query.includeOut === "false";
    const variantsOf = { $ifNull: ["$variants", []] };

    const pipeline = [
      { $match: { deletedAt: null, isActive: true, isCustom: { $ne: true } } },
      {
        $addFields: {
          lowVariants: {
            $filter: { input: variantsOf, as: "v", cond: { $lte: ["$$v.stock", "$lowStockThreshold"] } },
          },
          hasVariants: { $gt: [{ $size: variantsOf }, 0] },
        },
      },
      {
        $match: {
          $expr: {
            $or: [
              { $and: [{ $not: ["$hasVariants"] }, { $lte: ["$stock", "$lowStockThreshold"] }] },
              { $gt: [{ $size: "$lowVariants" }, 0] },
            ],
          },
        },
      },
      { $project: { name: 1, sku: 1, slug: 1, stock: 1, lowStockThreshold: 1, thumbnail: 1, hasVariants: 1, lowVariants: { _id: 1, name: 1, sku: 1, stock: 1 } } },
      { $sort: { stock: 1, name: 1 } },
    ];

    const all = await Product.aggregate(pipeline);
    let rows = all.flatMap((p) =>
      p.hasVariants
        ? p.lowVariants.map((v) => ({
            productId: p._id, name: p.name, slug: p.slug, thumbnail: p.thumbnail,
            variantId: v._id, variantName: v.name, sku: v.sku, stock: v.stock, threshold: p.lowStockThreshold,
          }))
        : [{ productId: p._id, name: p.name, slug: p.slug, thumbnail: p.thumbnail, variantId: null, sku: p.sku, stock: p.stock, threshold: p.lowStockThreshold }],
    );
    if (hideOut) rows = rows.filter((r) => r.stock > 0);
    rows.sort((a, b) => a.stock - b.stock);

    res.status(200).json({
      success: true,
      data: rows.slice(skip, skip + limit),
      pagination: { total: rows.length, page, limit, totalPages: Math.ceil(rows.length / limit) },
    });
  } catch (err) {
    serverError(res, err);
  }
};

/**
 * POST /api/v1/admin/inventory/:productId/adjust
 * Body: { variantId?, delta?, set?, reason?, note? }
 *   delta: add (+) or remove (-) units;  set: make the count exactly this.
 */
export const adjustStock = async (req, res) => {
  try {
    const { productId } = req.params;
    const { variantId, delta, set, reason = "manual", note } = req.body;

    if (!isObjectId(productId)) return res.status(400).json({ success: false, message: "Invalid product." });
    if (variantId !== undefined && variantId !== null && !isObjectId(variantId)) {
      return res.status(400).json({ success: false, message: "Invalid variant." });
    }
    if ((delta === undefined) === (set === undefined)) {
      return res.status(400).json({ success: false, message: "Send either delta or set." });
    }
    if (!["manual", "restock", "damage"].includes(reason)) {
      return res.status(400).json({ success: false, message: "reason must be manual, restock or damage." });
    }
    if (note !== undefined && (typeof note !== "string" || note.length > 300)) {
      return res.status(400).json({ success: false, message: "The note is too long." });
    }
    const amount = delta !== undefined ? Number(delta) : Number(set);
    if (!Number.isInteger(amount) || (set !== undefined && amount < 0) || Math.abs(amount) > 1000000) {
      return res.status(400).json({ success: false, message: "Enter a whole number of units." });
    }

    const product = await Product.findById(productId).select("name sku stock variants");
    if (!product) return res.status(404).json({ success: false, message: "Product not found." });

    const variant = variantId ? product.variants.id(variantId) : null;
    if (variantId && !variant) return res.status(404).json({ success: false, message: "Variant not found." });
    if (!variantId && product.variants.length) {
      return res.status(400).json({ success: false, message: "This product has options: choose which option to adjust." });
    }

    const before = variant ? variant.stock : product.stock;
    const change = set !== undefined ? amount - before : amount;
    if (change === 0) return res.status(400).json({ success: false, message: "That is already the current stock." });

    // Compare-and-set on the old count, and never below zero, so two people adjusting at once can not corrupt it
    const filter = variantId
      ? { _id: product._id, variants: { $elemMatch: { _id: variantId, stock: before } } }
      : { _id: product._id, stock: before };
    if (before + change < 0) {
      return res.status(400).json({ success: false, message: `Only ${before} in stock: can not remove ${-change}.` });
    }
    const update = variantId ? { $inc: { "variants.$.stock": change } } : { $inc: { stock: change } };
    const result = await Product.updateOne(filter, update);
    if (result.modifiedCount !== 1) {
      return res.status(409).json({ success: false, message: "The stock changed while you were editing. Please reload and try again." });
    }

    await logMovements([
      {
        product: product._id,
        variantId: variant?._id || null,
        name: product.name,
        sku: variant ? variant.sku : product.sku,
        delta: change,
        stockAfter: before + change,
        reason,
        by: req.user.email,
        note,
      },
    ]);
    if (before <= 0 && before + change > 0) void notifyBackInStock(product._id);

    res.status(200).json({ success: true, message: "Stock updated.", data: { before, after: before + change } });
  } catch (err) {
    serverError(res, err);
  }
};

/** GET /api/v1/admin/inventory/movements — the stock ledger (product, variantId, reason filters) */
export const getMovements = async (req, res) => {
  try {
    const { page, limit, skip } = paging(req.query, 30);
    const query = {};
    if (req.query.product) {
      if (!isObjectId(req.query.product)) return res.status(400).json({ success: false, message: "Invalid product." });
      query.product = req.query.product;
    }
    if (req.query.variantId) {
      if (!isObjectId(req.query.variantId)) return res.status(400).json({ success: false, message: "Invalid variant." });
      query.variantId = req.query.variantId;
    }
    if (req.query.reason) {
      if (!STOCK_REASONS.includes(req.query.reason)) return res.status(400).json({ success: false, message: "Unknown reason." });
      query.reason = req.query.reason;
    }
    const [total, data] = await Promise.all([
      StockMovement.countDocuments(query),
      StockMovement.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ]);
    res.status(200).json({ success: true, data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    serverError(res, err);
  }
};

/** GET /api/v1/admin/inventory/alerts — how many people wait for each sold-out product */
export const getStockAlerts = async (_req, res) => {
  try {
    const rows = await StockAlert.aggregate([
      { $match: { notifiedAt: null } },
      { $group: { _id: { product: "$product", variantId: "$variantId" }, waiting: { $sum: 1 } } },
      { $sort: { waiting: -1 } },
      { $limit: 100 },
      { $lookup: { from: "products", localField: "_id.product", foreignField: "_id", as: "p" } },
      { $project: { _id: 0, product: "$_id.product", variantId: "$_id.variantId", waiting: 1, name: { $arrayElemAt: ["$p.name", 0] }, sku: { $arrayElemAt: ["$p.sku", 0] } } },
    ]);
    res.status(200).json({ success: true, data: rows });
  } catch (err) {
    serverError(res, err);
  }
};

// ─── Public ───────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/stock-alerts
 * Body: { productId, variantId?, email } — "email me when it is back in stock".
 */
export const subscribeStockAlert = async (req, res) => {
  try {
    const { productId, variantId } = req.body;
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";

    if (!isObjectId(productId) || (variantId && !isObjectId(variantId))) {
      return res.status(400).json({ success: false, message: "Invalid product." });
    }
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, message: "Please enter a valid email address." });
    }

    const product = await Product.findOne({ _id: productId, isActive: true }).select("stock variants");
    if (!product) return res.status(404).json({ success: false, message: "Product not found." });

    const variant = variantId ? product.variants.id(variantId) : null;
    if (variantId && !variant) return res.status(404).json({ success: false, message: "Option not found." });
    const inStock = variant ? variant.stock > 0 : product.variants.length ? product.variants.some((v) => v.stock > 0) : product.stock > 0;
    if (inStock) {
      return res.status(409).json({ success: false, message: "This is in stock right now." });
    }

    // Same answer whether or not the address was already subscribed (no probing)
    await StockAlert.updateOne(
      { product: product._id, variantId: variant?._id || null, email },
      { $set: { notifiedAt: null } }, // also re-arms an alert that was already sent once
      { upsert: true },
    ).catch((err) => {
      if (err.code !== 11000) throw err;
    });

    res.status(200).json({ success: true, message: "We will email you when it is back in stock." });
  } catch (err) {
    serverError(res, err);
  }
};
