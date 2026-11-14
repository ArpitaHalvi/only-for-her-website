/**
 * cart.controller.js  (customer side)
 *
 *   GET    /cart              the cart, with current names, prices and stock
 *   POST   /cart/items        add a product (or option) { productId, variantId?, quantity? }
 *   PATCH  /cart/items/:id    set the quantity { quantity }
 *   DELETE /cart/items/:id    remove a line
 *   DELETE /cart              empty the cart
 */

import Cart from "../models/cart.model.js";
import Product from "../models/product.model.js";
import { unitPrice } from "../utils/orderPricing.js";

const MAX_QTY = 100;
const MAX_LINES = 50;

const fail = (status, message) => Object.assign(new Error(message), { status });
const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v));

const sendError = (res, err) => {
  if (err.status) return res.status(err.status).json({ success: false, message: err.message });
  console.error("cart error:", err);
  return res.status(500).json({ success: false, message: "Server error." });
};

const getCart = async (customerId) =>
  (await Cart.findOne({ customer: customerId })) ?? new Cart({ customer: customerId });

// Products that can still be bought
const buyable = (ids) => ({ _id: { $in: ids }, isActive: true, deletedAt: null });

/** The cart as the storefront shows it. Lines whose product is gone are dropped. */
async function present(cart) {
  const products = await Product.find(buyable(cart.items.map((i) => i.product)));
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const items = [];
  const stale = [];
  for (const line of cart.items) {
    const product = byId.get(String(line.product));
    const variant = product && line.variantId ? product.variants.id(line.variantId) : null;
    if (!product || (line.variantId && !variant)) {
      stale.push(line._id);
      continue;
    }
    const price = unitPrice(product, variant);
    const regular = variant?.price ?? product.price;
    const stock = variant ? variant.stock : product.stock;
    items.push({
      _id: line._id,
      productId: product._id,
      variantId: variant?._id ?? null,
      slug: product.slug,
      name: product.name,
      variantName: variant?.name,
      image: product.thumbnail?.url || product.gallery?.[0]?.url || null,
      price,
      mrp: regular > price ? regular : undefined,
      stock,
      quantity: line.quantity,
    });
  }

  // Tidy up lines that can never be bought again
  if (stale.length) {
    cart.items = cart.items.filter((i) => !stale.some((s) => s.equals(i._id)));
    if (!cart.isNew) await cart.save();
  }

  const count = items.reduce((n, i) => n + i.quantity, 0);
  const subtotal = Math.round(items.reduce((n, i) => n + i.price * i.quantity, 0) * 100) / 100;
  return { items, count, subtotal };
}

const reply = async (res, cart, status = 200) =>
  res.status(status).json({ success: true, data: await present(cart) });

export const viewCart = async (req, res) => {
  try {
    return await reply(res, await getCart(req.customer._id));
  } catch (err) {
    return sendError(res, err);
  }
};

export const addItem = async (req, res) => {
  try {
    const { productId, variantId = null } = req.body;
    const quantity = req.body.quantity === undefined ? 1 : Number(req.body.quantity);
    if (!isObjectId(productId) || (variantId && !isObjectId(variantId)))
      throw fail(400, "That product is not valid.");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY)
      throw fail(400, `Quantity must be a whole number from 1 to ${MAX_QTY}.`);

    const product = await Product.findOne(buyable([productId]));
    if (!product) throw fail(404, "This product is no longer available.");

    let variant = null;
    if (product.variants.length) {
      if (!variantId) throw fail(400, `Please choose an option for "${product.name}".`);
      variant = product.variants.id(variantId);
      if (!variant) throw fail(400, "That option is no longer available.");
    } else if (variantId) {
      throw fail(400, `"${product.name}" has no options.`);
    }

    const available = variant ? variant.stock : product.stock;
    const label = variant ? `${product.name} (${variant.name})` : product.name;
    if (available <= 0) throw fail(409, `"${label}" is out of stock.`);

    const cart = await getCart(req.customer._id);
    const line = cart.items.find(
      (i) => String(i.product) === String(product._id) && String(i.variantId ?? "") === String(variant?._id ?? ""),
    );
    const wanted = (line?.quantity ?? 0) + quantity;
    if (wanted > available) throw fail(409, `Only ${available} of "${label}" available.`);

    if (line) line.quantity = wanted;
    else {
      if (cart.items.length >= MAX_LINES) throw fail(400, "Your cart is full.");
      cart.items.push({ product: product._id, variantId: variant?._id ?? null, quantity });
    }
    await cart.save();
    return await reply(res, cart, 201);
  } catch (err) {
    return sendError(res, err);
  }
};

export const setQuantity = async (req, res) => {
  try {
    const quantity = Number(req.body.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY)
      throw fail(400, `Quantity must be a whole number from 1 to ${MAX_QTY}.`);

    const cart = await getCart(req.customer._id);
    const line = isObjectId(req.params.itemId) ? cart.items.id(req.params.itemId) : null;
    if (!line) throw fail(404, "That item is not in your cart.");

    const product = await Product.findOne(buyable([line.product]));
    const variant = product && line.variantId ? product.variants.id(line.variantId) : null;
    if (!product || (line.variantId && !variant)) throw fail(404, "This product is no longer available.");
    const available = variant ? variant.stock : product.stock;
    if (quantity > available) throw fail(409, `Only ${available} available.`);

    line.quantity = quantity;
    await cart.save();
    return await reply(res, cart);
  } catch (err) {
    return sendError(res, err);
  }
};

export const removeItem = async (req, res) => {
  try {
    const cart = await getCart(req.customer._id);
    const line = isObjectId(req.params.itemId) ? cart.items.id(req.params.itemId) : null;
    if (line) {
      line.deleteOne();
      await cart.save();
    }
    return await reply(res, cart);
  } catch (err) {
    return sendError(res, err);
  }
};

export const clearCart = async (req, res) => {
  try {
    await Cart.deleteOne({ customer: req.customer._id });
    return res.status(200).json({ success: true, data: { items: [], count: 0, subtotal: 0 } });
  } catch (err) {
    return sendError(res, err);
  }
};
