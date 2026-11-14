/**
 * PIN code serviceability.
 *   GET    /api/v1/serviceability/:pincode        public: can we deliver here? is COD available?
 *   GET    /api/v1/admin/serviceability           admin: list / search the PIN codes
 *   POST   /api/v1/admin/serviceability           admin: add one
 *   POST   /api/v1/admin/serviceability/bulk      admin: add or update many ({ areas: [...] })
 *   PUT    /api/v1/admin/serviceability/:id       admin: edit one
 *   DELETE /api/v1/admin/serviceability/:id       admin: remove one
 */
import ServiceArea from "../models/serviceArea.model.js";
import { checkPincode } from "../utils/serviceability.js";

const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v));
const FIELDS = ["pincode", "city", "state", "isServiceable", "codAvailable", "minDays", "maxDays", "note"];

const sendError = (res, err) => {
  if (err.name === "ValidationError") return res.status(400).json({ success: false, message: Object.values(err.errors).map((e) => e.message).join(" ") });
  if (err.code === 11000) return res.status(409).json({ success: false, message: "This PIN code is already listed." });
  if (err.status) return res.status(err.status).json({ success: false, message: err.message });
  console.error("serviceArea error:", err.message);
  return res.status(500).json({ success: false, message: "Server error." });
};

const pick = (body) => {
  const data = {};
  for (const f of FIELDS) {
    if (body[f] === undefined) continue;
    data[f] = body[f] === "" ? null : body[f];
  }
  if (data.pincode === null) delete data.pincode;
  return data;
};

export const lookupPincode = async (req, res) => {
  try {
    const result = await checkPincode(req.params.pincode);
    if (!result.valid) return res.status(400).json({ success: false, message: result.message });
    res.set("Cache-Control", "public, max-age=60");
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return sendError(res, err);
  }
};

export const listAreas = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
    const q = {};
    if (req.query.search) {
      const term = String(req.query.search).trim().slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      q.$or = [{ pincode: { $regex: `^${term}` } }, { city: { $regex: term, $options: "i" } }, { state: { $regex: term, $options: "i" } }];
    }
    if (req.query.serviceable === "true") q.isServiceable = true;
    if (req.query.serviceable === "false") q.isServiceable = false;
    const total = await ServiceArea.countDocuments(q);
    const data = await ServiceArea.find(q).sort({ pincode: 1 }).skip((page - 1) * limit).limit(limit);
    return res.status(200).json({ success: true, data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    return sendError(res, err);
  }
};

export const createArea = async (req, res) => {
  try {
    const area = await ServiceArea.create(pick(req.body));
    return res.status(201).json({ success: true, message: "PIN code added.", data: area });
  } catch (err) {
    return sendError(res, err);
  }
};

export const bulkSaveAreas = async (req, res) => {
  try {
    const { areas } = req.body;
    if (!Array.isArray(areas) || !areas.length || areas.length > 5000)
      return res.status(400).json({ success: false, message: "areas must be a list of 1 to 5000 PIN codes." });

    const ops = [];
    const rejected = [];
    areas.forEach((a, i) => {
      const doc = new ServiceArea(pick(a || {}));
      const err = doc.validateSync();
      if (err) return rejected.push({ row: i + 1, pincode: a?.pincode, reason: Object.values(err.errors).map((e) => e.message).join(" ") });
      const { _id, createdAt, updatedAt, ...set } = doc.toObject();
      ops.push({ updateOne: { filter: { pincode: doc.pincode }, update: { $set: set }, upsert: true } });
    });
    const result = ops.length ? await ServiceArea.bulkWrite(ops, { ordered: false }) : { upsertedCount: 0, modifiedCount: 0 };
    return res.status(200).json({ success: true, message: "PIN codes saved.", added: result.upsertedCount, updated: result.modifiedCount, rejected });
  } catch (err) {
    return sendError(res, err);
  }
};

export const updateArea = async (req, res) => {
  try {
    const area = isObjectId(req.params.id) ? await ServiceArea.findById(req.params.id) : null;
    if (!area) return res.status(404).json({ success: false, message: "PIN code not found." });
    area.set(pick(req.body));
    await area.save();
    return res.status(200).json({ success: true, message: "PIN code updated.", data: area });
  } catch (err) {
    return sendError(res, err);
  }
};

export const deleteArea = async (req, res) => {
  try {
    const area = isObjectId(req.params.id) ? await ServiceArea.findByIdAndDelete(req.params.id) : null;
    if (!area) return res.status(404).json({ success: false, message: "PIN code not found." });
    return res.status(200).json({ success: true, message: "PIN code removed." });
  } catch (err) {
    return sendError(res, err);
  }
};
