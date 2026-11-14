import AppConfig from "../models/appConfig.model.js";
import Coupon from "../models/coupon.model.js";
import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import ProductCategory from "../models/productCategory.model.js";

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Tax and shipping settings from App Configuration, with safe defaults:
 * prices include tax, no tax shown, and shipping is free.
 */
export async function getCommerceSettings() {
  const config = (await AppConfig.findOne().lean()) || {};
  return {
    taxMode: config.taxMode === "exclusive" ? "exclusive" : "inclusive",
    taxRate: Math.max(0, Number(config.taxRate) || 0),
    shippingCharge: Math.max(0, Number(config.shippingCharge) || 0),
    freeShippingAbove:
      config.freeShippingAbove === null || config.freeShippingAbove === undefined
        ? null
        : Number(config.freeShippingAbove),
    codEnabled: config.codEnabled !== false,
    codCharge: Math.max(0, Number(config.codCharge) || 0),
    codMaxAmount: config.codMaxAmount == null ? null : Number(config.codMaxAmount),
    giftWrapOptions: (config.giftWrapOptions || []).filter((o) => o.isActive !== false).map((o) => ({ id: String(o._id), name: o.name, description: o.description, price: Number(o.price) || 0, image: o.image })),
    trackingUrlTemplate: config.trackingUrlTemplate || "",
  };
}

/**
 * Which payment methods this order can use. `total` is the amount before any
 * cash on delivery fee.
 */
export function paymentOptions(settings, total) {
  let codReason;
  if (!settings.codEnabled) codReason = "Cash on delivery is not available right now.";
  else if (settings.codMaxAmount != null && total > settings.codMaxAmount)
    codReason = `Cash on delivery is available for orders up to ₹${settings.codMaxAmount.toLocaleString("en-IN")}.`;

  return [
    { method: "razorpay", enabled: total >= 1, fee: 0, reason: total >= 1 ? undefined : "The total is too low to pay online." },
    { method: "cod", enabled: !codReason, fee: settings.codCharge, reason: codReason },
  ];
}

/**
 * What the customer pays for one unit of a product (or one of its variants).
 * A variant with its own price replaces the product's price and sale price;
 * a variant with only a sale price discounts the product's regular price.
 */
export function unitPrice(product, variant) {
  const price = variant?.price ?? product.price;
  const salePrice = variant
    ? (variant.salePrice ?? (variant.price != null ? null : product.salePrice))
    : product.salePrice;
  return salePrice ?? price;
}

/**
 * Checks a coupon for this cart. Returns { coupon, discount } or throws an
 * Error with a message that is safe to show to the customer.
 */
export async function evaluateCoupon(code, subtotal, customerId, lines = []) {
  const coupon = await Coupon.findOne({ code: String(code).trim().toUpperCase() });
  const fail = (msg) => {
    throw Object.assign(new Error(msg), { status: 400 });
  };

  if (!coupon || !coupon.isActive) fail("This coupon code is not valid.");
  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) fail("This coupon is not active yet.");
  if (coupon.expiresAt && coupon.expiresAt < now) fail("This coupon has expired.");
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit)
    fail("This coupon has reached its usage limit.");
  if (subtotal < (coupon.minOrderAmount || 0))
    fail(`This coupon needs an order of at least ₹${coupon.minOrderAmount}.`);

  if (coupon.perCustomerLimit != null && customerId) {
    const used = await Order.countDocuments({
      customer: customerId,
      couponCode: coupon.code,
      status: { $nin: ["cancelled", "failed"] },
    });
    if (used >= coupon.perCustomerLimit) fail("You have already used this coupon.");
  }

  if (coupon.firstOrderOnly) {
    if (!customerId) fail("Sign in to use this coupon.");
    const previous = await Order.countDocuments({ customer: customerId, status: { $nin: ["cancelled", "failed"] } });
    if (previous > 0) fail("This coupon is only for your first order.");
  }

  // Which part of the cart the coupon counts
  let eligible = subtotal;
  const scoped = coupon.applicableProducts?.length || coupon.applicableCategories?.length || coupon.excludedProducts?.length;
  if (scoped && lines.length) {
    const ids = [...new Set(lines.map((l) => String(l.product)))];
    const products = await Product.find({ _id: { $in: ids } }).select("category").setOptions({ withDeleted: true }).lean();
    const categoryOf = new Map(products.map((p) => [String(p._id), String(p.category)]));
    const cats = await ProductCategory.find().select("parent").setOptions({ withDeleted: true }).lean();
    const parentOf = new Map(cats.map((c) => [String(c._id), c.parent ? String(c.parent) : null]));
    const prodSet = new Set((coupon.applicableProducts || []).map(String));
    const catSet = new Set((coupon.applicableCategories || []).map(String));
    const excluded = new Set((coupon.excludedProducts || []).map(String));
    const inCategory = (cid) => {
      for (let c = cid, hops = 0; c && hops < 10; c = parentOf.get(c), hops++) if (catSet.has(c)) return true;
      return false;
    };
    const restricted = prodSet.size || catSet.size;
    eligible = lines.reduce((sum, l) => {
      const pid = String(l.product);
      if (excluded.has(pid)) return sum;
      if (restricted && !prodSet.has(pid) && !inCategory(categoryOf.get(pid))) return sum;
      return sum + l.lineTotal;
    }, 0);
    if (eligible <= 0 && coupon.type !== "free_shipping") fail("This coupon does not apply to the items in your cart.");
  }

  if (coupon.type === "free_shipping") return { coupon, discount: 0, freeShipping: true };

  let discount = coupon.type === "percent" ? (eligible * coupon.value) / 100 : coupon.value;
  if (coupon.type === "percent" && coupon.maxDiscount != null) discount = Math.min(discount, coupon.maxDiscount);
  discount = round2(Math.min(discount, eligible));

  return { coupon, discount, freeShipping: false };
}

/**
 * The money breakdown for a cart.
 *   inclusive: prices already contain tax, so the tax figure is only a
 *              breakdown and is not added to the total.
 *   exclusive: tax is added on top of the discounted subtotal.
 */
export function computeTotals({ subtotal, discount = 0, settings, paymentMethod = "razorpay", freeShipping = false, giftWrapCharge = 0 }) {
  const taxable = Math.max(0, subtotal - discount);
  const { taxMode, taxRate, shippingCharge, freeShippingAbove } = settings;

  const tax =
    taxMode === "inclusive"
      ? round2((taxable * taxRate) / (100 + taxRate))
      : round2((taxable * taxRate) / 100);

  const shipping =
    freeShipping || (freeShippingAbove != null && taxable >= freeShippingAbove) ? 0 : shippingCharge;

  const codCharge = paymentMethod === "cod" ? round2(settings.codCharge || 0) : 0;
  const giftWrap = round2(giftWrapCharge || 0);
  const totalAmount = round2(taxable + (taxMode === "exclusive" ? tax : 0) + shipping + codCharge + giftWrap);

  return {
    subtotal: round2(subtotal),
    discount: round2(discount),
    shippingCharge: round2(shipping),
    codCharge,
    giftWrapCharge: giftWrap,
    tax,
    taxMode,
    taxRate,
    totalAmount,
  };
}
