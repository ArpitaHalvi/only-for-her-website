/**
 * What a shopper built up while signed out, merged into the account at sign-in,
 * plus "recently viewed" for signed-in customers.
 *
 *   POST /api/v1/cart/merge                          { items: [{ productId, variantId?, quantity }] }
 *   POST /api/v1/customer/me/wishlist/merge          { productIds: [...] }
 *   GET  /api/v1/customer/me/recently-viewed
 *   POST /api/v1/customer/me/recently-viewed         { productIds: [...] }   (oldest first; merges a guest list)
 *   POST /api/v1/customer/me/recently-viewed/:productId
 */
import Cart from "../models/cart.model.js";
import Product from "../models/product.model.js";
import Customer from "../models/customer.model.js";

const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v));
const MAX_WISHLIST = 200;
const MAX_LINES = 50;
const MAX_QTY = 100;
const MAX_RECENT = 20;

const bad = (res, message) => res.status(400).json({ success: false, message });
const serverError = (res, err) => {
  console.error("customerExtras error:", err.message);
  return res.status(500).json({ success: false, message: "Server error." });
};

/** Adds guest cart lines to the account's cart. Lines that cannot be bought are skipped and reported. */
export const mergeCart = async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length > MAX_LINES) return bad(res, `items must be a list of up to ${MAX_LINES} lines.`);

    const cart = (await Cart.findOne({ customer: req.customer._id })) ?? new Cart({ customer: req.customer._id });
    const skipped = [];
    let added = 0;

    for (const raw of items) {
      const quantity = Number(raw?.quantity ?? 1);
      if (!isObjectId(raw?.productId) || (raw.variantId && !isObjectId(raw.variantId)) || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
        skipped.push({ productId: raw?.productId, reason: "Not a valid item." });
        continue;
      }
      const product = await Product.findOne({ _id: raw.productId, isActive: true, deletedAt: null });
      if (!product) { skipped.push({ productId: raw.productId, reason: "No longer available." }); continue; }
      let variant = null;
      if (product.variants.length) {
        variant = raw.variantId ? product.variants.id(raw.variantId) : null;
        if (!variant) { skipped.push({ productId: raw.productId, reason: "Please choose an option." }); continue; }
      }
      const available = variant ? variant.stock : product.stock;
      if (available <= 0) { skipped.push({ productId: raw.productId, reason: "Out of stock." }); continue; }

      const line = cart.items.find((i) => String(i.product) === String(product._id) && String(i.variantId ?? "") === String(variant?._id ?? ""));
      if (line) {
        // The same item in both: keep the larger quantity (not the sum, so a repeated merge changes nothing)
        line.quantity = Math.min(Math.max(line.quantity, quantity), available);
      } else {
        if (cart.items.length >= MAX_LINES) { skipped.push({ productId: raw.productId, reason: "Your cart is full." }); continue; }
        cart.items.push({ product: product._id, variantId: variant?._id ?? null, quantity: Math.min(quantity, available) });
      }
      added++;
    }
    await cart.save();
    return res.status(200).json({ success: true, message: "Cart updated.", merged: added, skipped });
  } catch (err) {
    return serverError(res, err);
  }
};

export const mergeWishlist = async (req, res) => {
  try {
    const { productIds } = req.body;
    if (!Array.isArray(productIds) || productIds.length > MAX_WISHLIST || !productIds.every(isObjectId)) return bad(res, "productIds must be a list of product ids.");
    const live = await Product.find({ _id: { $in: productIds }, isActive: true, deletedAt: null }).select("_id");
    const have = new Set(req.customer.wishlist.map(String));
    for (const p of live) {
      if (req.customer.wishlist.length >= MAX_WISHLIST) break;
      if (!have.has(String(p._id))) req.customer.wishlist.push(p._id);
    }
    await req.customer.save();
    return res.status(200).json({ success: true, message: "Wishlist updated.", wishlist: req.customer.wishlist });
  } catch (err) {
    return serverError(res, err);
  }
};

const CARD_FIELDS = "name slug thumbnail price salePrice effectivePrice rating reviewCount stock variants";

export const getRecentlyViewed = async (req, res) => {
  try {
    const c = await Customer.findById(req.customer._id).select("recentlyViewed");
    const ids = (c?.recentlyViewed || []).map((r) => r.product);
    const rows = await Product.find({ _id: { $in: ids }, isActive: true, deletedAt: null }).select(CARD_FIELDS);
    const order = new Map(ids.map((id, i) => [String(id), i]));
    return res.status(200).json({ success: true, data: rows.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id))) });
  } catch (err) {
    return serverError(res, err);
  }
};

async function remember(customerId, productIds) {
  const c = await Customer.findById(customerId).select("recentlyViewed");
  let list = (c.recentlyViewed || []).map((r) => ({ product: r.product, at: r.at }));
  for (const id of productIds) {
    list = list.filter((r) => String(r.product) !== String(id));
    list.unshift({ product: id, at: new Date() }); // newest first
  }
  c.recentlyViewed = list.slice(0, MAX_RECENT);
  await c.save();
}

// POST /me/recently-viewed  { productIds } — ids oldest first, so the last one ends up on top
export const mergeRecentlyViewed = async (req, res) => {
  try {
    const { productIds } = req.body;
    if (!Array.isArray(productIds) || productIds.length > 50 || !productIds.every(isObjectId)) return bad(res, "productIds must be a list of product ids.");
    await remember(req.customer._id, productIds);
    return res.status(200).json({ success: true, message: "Saved." });
  } catch (err) {
    return serverError(res, err);
  }
};

export const addRecentlyViewed = async (req, res) => {
  try {
    if (!isObjectId(req.params.productId)) return bad(res, "Invalid product.");
    await remember(req.customer._id, [req.params.productId]);
    return res.status(200).json({ success: true, message: "Saved." });
  } catch (err) {
    return serverError(res, err);
  }
};
