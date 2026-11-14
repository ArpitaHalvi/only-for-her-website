import Collection from "../models/collection.model.js";
import Product from "../models/product.model.js";
import { uploadToCloudinary, destroyFromCloudinary } from "../utils/cloudinaryService.js";

const CLOUDINARY_FOLDER = "only-for-her/collections";
const EDITABLE_FIELDS = ["name", "slug", "description", "isActive", "isFeatured", "sortOrder", "metaTitle", "metaDescription"];
const IMAGE_FIELDS = ["image", "banner"];
const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v));

const pickFields = (body) => {
  const data = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] === undefined) continue;
    if (typeof body[field] === "object" && body[field] !== null) continue; // plain values only
    data[field] = body[field];
  }
  return data;
};

const upload = async (file) => {
  const result = await uploadToCloudinary(file.path || file.buffer, CLOUDINARY_FOLDER);
  return { url: result.secure_url || result.url, publicId: result.public_id };
};

const sendError = (res, error) => {
  if (error.name === "ValidationError") {
    return res.status(400).json({ success: false, message: Object.values(error.errors).map((e) => e.message).join(" ") });
  }
  if (error.code === 11000) {
    return res.status(409).json({ success: false, message: "A collection with this slug already exists." });
  }
  if (error.name === "CastError") return res.status(400).json({ success: false, message: "Invalid value." });
  console.error("[collection.controller.js]", error.message);
  return res.status(500).json({ success: false, message: "Internal Server Error" });
};

// GET /api/v1/collections — active collections for the storefront
export const getCollections = async (req, res) => {
  try {
    const query = { isActive: true };
    if (req.query.featured === "true") query.isFeatured = true;
    const data = await Collection.find(query).sort({ sortOrder: 1, name: 1 });
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
};

// GET /api/v1/collections/:slugOrId
export const getCollection = async (req, res) => {
  try {
    const { slugOrId } = req.params;
    const query = isObjectId(slugOrId) ? { _id: slugOrId } : { slug: String(slugOrId).toLowerCase() };
    const collection = await Collection.findOne({ ...query, isActive: true });
    if (!collection) return res.status(404).json({ success: false, message: "Collection not found." });
    res.status(200).json({ success: true, data: collection });
  } catch (error) {
    sendError(res, error);
  }
};

// GET /api/v1/collections/admin/list — includes inactive ones, with product counts
export const getAdminCollections = async (_req, res) => {
  try {
    const [collections, counts] = await Promise.all([
      Collection.find().sort({ sortOrder: 1, name: 1 }).lean(),
      Product.aggregate([{ $match: { deletedAt: null } }, { $unwind: "$collections" }, { $group: { _id: "$collections", n: { $sum: 1 } } }]),
    ]);
    const byId = new Map(counts.map((c) => [String(c._id), c.n]));
    res.status(200).json({ success: true, data: collections.map((c) => ({ ...c, productCount: byId.get(String(c._id)) || 0 })) });
  } catch (error) {
    sendError(res, error);
  }
};

const applyImages = async (req, collection) => {
  const old = [];
  for (const field of IMAGE_FIELDS) {
    const file = req.files?.[field]?.[0];
    if (!file) continue;
    if (collection[field]?.publicId) old.push(collection[field].publicId);
    collection[field] = await upload(file);
  }
  return old;
};

const destroyAll = (ids) => Promise.all(ids.map((id) => destroyFromCloudinary(id))).catch((e) => console.error("collection image cleanup:", e.message));

// POST /api/v1/collections
export const createCollection = async (req, res) => {
  try {
    if (!req.body.name || typeof req.body.name !== "string") {
      return res.status(400).json({ success: false, message: "Collection name is required." });
    }
    const collection = new Collection(pickFields(req.body));
    await applyImages(req, collection);
    await collection.save();
    res.status(201).json({ success: true, message: "Collection created.", data: collection });
  } catch (error) {
    sendError(res, error);
  }
};

// PUT / PATCH /api/v1/collections/:id
export const updateCollection = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid id." });
    const collection = await Collection.findById(req.params.id);
    if (!collection) return res.status(404).json({ success: false, message: "Collection not found." });
    collection.set(pickFields(req.body));
    const old = await applyImages(req, collection);
    await collection.save();
    await destroyAll(old);
    res.status(200).json({ success: true, message: "Collection updated.", data: collection });
  } catch (error) {
    sendError(res, error);
  }
};

// DELETE /api/v1/collections/:id — hidden (soft delete) and removed from its products
export const deleteCollection = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid id." });
    const collection = await Collection.findById(req.params.id);
    if (!collection) return res.status(404).json({ success: false, message: "Collection not found." });
    collection.deletedAt = new Date();
    collection.isActive = false;
    await collection.save();
    await Product.updateMany({ collections: collection._id }, { $pull: { collections: collection._id } }).setOptions({ withDeleted: true });
    res.status(200).json({ success: true, message: "Collection deleted." });
  } catch (error) {
    sendError(res, error);
  }
};

// GET /api/v1/collections/admin/:id/products — products currently in a collection
export const getCollectionProducts = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid id." });
    const data = await Product.find({ collections: req.params.id })
      .select("name sku slug thumbnail price salePrice stock isActive")
      .sort({ name: 1 })
      .limit(500)
      .lean();
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
};

/**
 * POST /api/v1/collections/:id/products
 * Body: { productIds: [...], action?: "add" | "remove" | "set" }  (default "add")
 * "set" makes the collection contain exactly these products.
 */
export const assignCollectionProducts = async (req, res) => {
  try {
    const { id } = req.params;
    const { productIds, action = "add" } = req.body;
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: "Invalid id." });
    if (!["add", "remove", "set"].includes(action)) return res.status(400).json({ success: false, message: "action must be add, remove or set." });
    if (!Array.isArray(productIds) || productIds.length > 500 || !productIds.every(isObjectId))
      return res.status(400).json({ success: false, message: "productIds must be a list of up to 500 product ids." });
    if (!(await Collection.exists({ _id: id }))) return res.status(404).json({ success: false, message: "Collection not found." });

    if (action === "add") await Product.updateMany({ _id: { $in: productIds } }, { $addToSet: { collections: id } });
    else if (action === "remove") await Product.updateMany({ _id: { $in: productIds } }, { $pull: { collections: id } });
    else {
      await Product.updateMany({ collections: id, _id: { $nin: productIds } }, { $pull: { collections: id } });
      await Product.updateMany({ _id: { $in: productIds } }, { $addToSet: { collections: id } });
    }
    const count = await Product.countDocuments({ collections: id });
    res.status(200).json({ success: true, message: "Collection updated.", data: { productCount: count } });
  } catch (error) {
    sendError(res, error);
  }
};

// PUT /api/v1/collections/reorder — body: { order: [id, id, ...] } sets the display order
export const reorderCollections = async (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order) || order.length > 500 || !order.every(isObjectId))
      return res.status(400).json({ success: false, message: "order must be a list of collection ids." });
    await Collection.bulkWrite(order.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { $set: { sortOrder: i } } } })));
    res.status(200).json({ success: true, message: "Order saved." });
  } catch (error) {
    sendError(res, error);
  }
};
