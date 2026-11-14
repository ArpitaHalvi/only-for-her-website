import Coupon from "../models/coupon.model.js";

const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v));
const FIELDS = [
  "code", "description", "type", "value", "maxDiscount", "minOrderAmount",
  "startsAt", "expiresAt", "usageLimit", "perCustomerLimit", "isActive",
  "firstOrderOnly", "applicableProducts", "applicableCategories", "excludedProducts",
];
const ID_LISTS = ["applicableProducts", "applicableCategories", "excludedProducts"];

const sendError = (res, err) => {
  if (err.name === "ValidationError")
    return res.status(400).json({ success: false, message: Object.values(err.errors).map((e) => e.message).join(" ") });
  if (err.code === 11000)
    return res.status(409).json({ success: false, message: "A coupon with this code already exists." });
  console.error("coupon error:", err);
  return res.status(500).json({ success: false, message: "Server error." });
};

// "" from a form means "not set"
const pick = (body) => {
  const data = {};
  for (const f of FIELDS) {
    if (body[f] === undefined) continue;
    if (ID_LISTS.includes(f)) {
      const list = Array.isArray(body[f]) ? body[f] : [];
      if (list.length > 500 || !list.every(isObjectId)) throw Object.assign(new Error(`${f} must be a list of ids.`), { name: "ValidationError", errors: { [f]: { message: `${f} must be a list of ids.` } } });
      data[f] = list;
      continue;
    }
    data[f] = body[f] === "" ? null : body[f];
  }
  if (data.code === null) delete data.code;
  return data;
};

export const listCoupons = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const query = {};
    if (req.query.search) query.code = { $regex: String(req.query.search).trim().toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") };

    const total = await Coupon.countDocuments(query);
    const data = await Coupon.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);
    res.status(200).json({ success: true, data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    sendError(res, err);
  }
};

export const getCoupon = async (req, res) => {
  try {
    const coupon = isObjectId(req.params.id) ? await Coupon.findById(req.params.id) : null;
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found." });
    res.status(200).json({ success: true, data: coupon });
  } catch (err) {
    sendError(res, err);
  }
};

export const createCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.create(pick(req.body));
    res.status(201).json({ success: true, message: "Coupon created.", data: coupon });
  } catch (err) {
    sendError(res, err);
  }
};

export const updateCoupon = async (req, res) => {
  try {
    const coupon = isObjectId(req.params.id) ? await Coupon.findById(req.params.id) : null;
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found." });
    coupon.set(pick(req.body));
    await coupon.save();
    res.status(200).json({ success: true, message: "Coupon updated.", data: coupon });
  } catch (err) {
    sendError(res, err);
  }
};

export const deleteCoupon = async (req, res) => {
  try {
    const coupon = isObjectId(req.params.id) ? await Coupon.findById(req.params.id) : null;
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found." });
    // Orders keep the code they used, so a used coupon is switched off, not erased
    if (coupon.usedCount > 0) {
      coupon.isActive = false;
      await coupon.save();
      return res.status(200).json({ success: true, message: "This coupon has been used, so it was deactivated instead of deleted." });
    }
    await coupon.deleteOne();
    res.status(200).json({ success: true, message: "Coupon deleted." });
  } catch (err) {
    sendError(res, err);
  }
};
