import Product from "../models/product.model.js";
import { logMovements, movementFor, notifyBackInStock } from "../services/inventoryService.js";

// Order items carry { product, variantId, quantity }.
const filterFor = (item, minStock) =>
  item.variantId
    ? {
        _id: item.product,
        deletedAt: null,
        variants: { $elemMatch: { _id: item.variantId, stock: { $gte: minStock } } },
      }
    : { _id: item.product, deletedAt: null, stock: { $gte: minStock } };

const incFor = (item, by) =>
  item.variantId ? { $inc: { "variants.$.stock": by } } : { $inc: { stock: by } };

/**
 * Takes the items out of stock, all or nothing. Each decrement only succeeds
 * if enough stock is left, so two shoppers can never buy the last unit.
 * Returns { ok: true } or { ok: false, item } for the first item that did not fit.
 * `meta` ({ order, by, note }) is recorded in the stock ledger.
 */
export async function reserveStock(items, meta = {}) {
  const done = [];
  for (const item of items) {
    const res = await Product.updateOne(filterFor(item, item.quantity), incFor(item, -item.quantity));
    if (res.modifiedCount !== 1) {
      // put back what was already taken
      await releaseStock(done, { note: "Rolled back: another item did not fit" });
      return { ok: false, item };
    }
    done.push(item);
  }
  await logMovements(done.map((item) => movementFor(item, -item.quantity, "order", meta)));
  return { ok: true };
}

/** Puts the items back into stock. `reason` defaults to "order_release" (ledger). */
export async function releaseStock(items, { reason = "order_release", ...meta } = {}) {
  for (const item of items) {
    const filter = item.variantId
      ? { _id: item.product, "variants._id": item.variantId }
      : { _id: item.product };
    await Product.updateOne(filter, incFor(item, item.quantity));
  }
  await logMovements(items.map((item) => movementFor(item, item.quantity, reason, meta)));
  // Anyone waiting for these products to come back is told (no-op when nobody is)
  for (const productId of new Set(items.map((i) => String(i.product)))) {
    void notifyBackInStock(productId);
  }
}

/**
 * Releases an order's stock once. Safe to call repeatedly: the
 * `stockReserved` flag is flipped first with an atomic update, and only the
 * call that flips it puts the items back.
 */
export async function releaseOrderStock(OrderModel, order) {
  const flipped = await OrderModel.updateOne(
    { _id: order._id, stockReserved: true },
    { $set: { stockReserved: false } },
  );
  if (flipped.modifiedCount === 1) {
    await releaseStock(order.items, { order: order._id, note: order.cancelReason });
    order.stockReserved = false;
    return true;
  }
  return false;
}
