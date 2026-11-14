/**
 * Homepage management.
 *
 *   GET  /api/v1/home                         public: everything the homepage shows right now
 *   /api/v1/admin/home/sections               admin: add, edit, hide, reorder, delete sections
 *   /api/v1/admin/home/announcements          admin: the strip above the header
 *
 * Hero banners are managed with the offers (see offer.controller.js).
 */
import HomeSection, { SECTION_TYPES } from "../models/homeSection.model.js";
import Announcement from "../models/announcement.model.js";
import Offer from "../models/offer.model.js";
import Product from "../models/product.model.js";
import ProductCategory from "../models/productCategory.model.js";
import Collection from "../models/collection.model.js";
import { uploadToCloudinary, destroyFromCloudinary } from "../utils/cloudinaryService.js";

const FOLDER = "only-for-her/homepage";
const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v));

const sendError = (res, error) => {
  if (error.name === "ValidationError")
    return res.status(400).json({ success: false, message: Object.values(error.errors).map((e) => e.message).join(" ") });
  if (error.name === "CastError") return res.status(400).json({ success: false, message: "Invalid value." });
  if (error.status && error.status < 500) return res.status(error.status).json({ success: false, message: error.message });
  console.error("[homepage.controller.js]", error.message);
  return res.status(500).json({ success: false, message: "Internal Server Error" });
};
const fail = (status, message) => Object.assign(new Error(message), { status });
const notFound = (res, what) => res.status(404).json({ success: false, message: `${what} not found.` });

const upload = async (file) => {
  const r = await uploadToCloudinary(file.path || file.buffer, FOLDER);
  return { url: r.secure_url || r.url, publicId: r.public_id };
};

// Multipart forms send lists as JSON text or comma separated ids
const idList = (value, label) => {
  let list = value;
  if (typeof value === "string") {
    const t = value.trim();
    if (t.startsWith("[")) {
      try { list = JSON.parse(t); } catch { throw fail(400, `${label} is not valid.`); }
    } else list = t ? t.split(",") : [];
  }
  if (!Array.isArray(list)) throw fail(400, `${label} must be a list.`);
  list = [...new Set(list.map((v) => String(v).trim()).filter(Boolean))];
  if (list.length > 50 || !list.every(isObjectId)) throw fail(400, `${label} must be a list of up to 50 ids.`);
  return list;
};

const dateOrNull = (v) => (v === "" || v === "null" || v == null ? null : v);
const inSchedule = (now) => ({
  $and: [
    { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
    { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
  ],
});

// ─── Public ───────────────────────────────────────────────────────────────

const CARD_FIELDS = "name slug thumbnail price salePrice effectivePrice rating reviewCount stock variants isBestseller isNewArrival isFeatured";
const liveProducts = (extra = {}) => ({ isActive: true, deletedAt: null, isCustom: { $ne: true }, ...extra });

async function productsFor(section) {
  const limit = section.limit || 8;
  switch (section.type) {
    case "featured_products":
      return Product.find(liveProducts({ isFeatured: true })).select(CARD_FIELDS).sort({ updatedAt: -1 }).limit(limit);
    case "bestsellers":
      return Product.find(liveProducts({ isBestseller: true })).select(CARD_FIELDS).sort({ updatedAt: -1 }).limit(limit);
    case "new_arrivals":
      return Product.find(liveProducts({ isNewArrival: true })).select(CARD_FIELDS).sort({ createdAt: -1 }).limit(limit);
    case "product_list": {
      const rows = await Product.find(liveProducts({ _id: { $in: section.products } })).select(CARD_FIELDS);
      const order = new Map(section.products.map((id, i) => [String(id), i]));
      return rows.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)));
    }
    case "collection":
      return section.featuredCollection ? Product.find(liveProducts({ collections: section.featuredCollection._id || section.featuredCollection })).select(CARD_FIELDS).sort({ createdAt: -1 }).limit(limit) : [];
    default:
      return undefined;
  }
}

// GET /api/v1/home
export const getHomepage = async (_req, res) => {
  try {
    const now = new Date();
    const [announcements, hero, promo, sections] = await Promise.all([
      Announcement.find({ isActive: true, ...inSchedule(now) }).sort({ sortOrder: 1, createdAt: -1 }).select("text link"),
      Offer.find({ isActive: true, placement: "hero", ...inSchedule(now) }).sort({ sortOrder: 1, createdAt: -1 }).select("title subtitle ctaText image mobileImage link"),
      Offer.find({ isActive: true, placement: { $ne: "hero" }, ...inSchedule(now) }).sort({ sortOrder: 1, createdAt: -1 }).select("title image mobileImage link"),
      HomeSection.find({ isVisible: true, ...inSchedule(now) })
        .sort({ sortOrder: 1, createdAt: 1 })
        .populate("featuredCollection", "name slug image banner")
        .populate("categories", "name slug image")
        .populate("collections", "name slug image banner"),
    ]);

    // Automatic grids fall back to the shop's own categories / collections
    let topCategories;
    let featuredCollections;
    const data = [];
    for (const s of sections) {
      const out = s.toObject();
      delete out.products; // the resolved list replaces the id list
      if (s.type === "hero") out.banners = hero;
      else if (s.type === "category_grid") {
        if (!out.categories?.length) {
          topCategories ??= await ProductCategory.find({ parent: null, isActive: true }).sort({ sortOrder: 1, name: 1 }).limit(12).select("name slug image");
          out.categories = topCategories;
        }
      } else if (s.type === "collection_grid") {
        if (!out.collections?.length) {
          featuredCollections ??= await Collection.find({ isActive: true, isFeatured: true }).sort({ sortOrder: 1, name: 1 }).limit(12).select("name slug image banner");
          out.collections = featuredCollections;
        }
      } else {
        const products = await productsFor(s);
        if (products) out.products = products.map((p) => p.toJSON());
      }
      data.push(out);
    }

    res.set("Cache-Control", "public, max-age=60");
    res.status(200).json({ success: true, data: { announcements, heroBanners: hero, promoBanners: promo, sections: data } });
  } catch (error) {
    sendError(res, error);
  }
};

// ─── Admin: sections ──────────────────────────────────────────────────────

const SECTION_FIELDS = ["type", "name", "title", "subtitle", "ctaText", "ctaLink", "body", "limit", "isVisible", "sortOrder", "startsAt", "endsAt"];

function readSection(body) {
  const data = {};
  for (const f of SECTION_FIELDS) {
    if (body[f] === undefined) continue;
    data[f] = f === "startsAt" || f === "endsAt" ? dateOrNull(body[f]) : body[f];
  }
  if (data.type !== undefined && !SECTION_TYPES.includes(data.type)) throw fail(400, `type must be one of: ${SECTION_TYPES.join(", ")}.`);
  if (body.products !== undefined) data.products = idList(body.products, "products");
  if (body.categories !== undefined) data.categories = idList(body.categories, "categories");
  if (body.featuredCollections !== undefined) data.collections = idList(body.featuredCollections, "collections");
  if (body.featuredCollection !== undefined) {
    const c = body.featuredCollection === "" || body.featuredCollection === "null" ? null : body.featuredCollection;
    if (c && !isObjectId(c)) throw fail(400, "collection must be a collection id.");
    data.featuredCollection = c;
  }
  return data;
}

// GET /api/v1/admin/home/sections
export const listSections = async (_req, res) => {
  try {
    const data = await HomeSection.find().sort({ sortOrder: 1, createdAt: 1 }).populate("products", "name sku thumbnail").populate("categories", "name").populate("collections", "name").populate("featuredCollection", "name");
    res.status(200).json({ success: true, data, types: SECTION_TYPES });
  } catch (error) {
    sendError(res, error);
  }
};

// POST /api/v1/admin/home/sections   (multipart: fields + optional image, mobileImage)
export const createSection = async (req, res) => {
  try {
    const section = new HomeSection(readSection(req.body));
    if (section.sortOrder === 0 || req.body.sortOrder === undefined) {
      const last = await HomeSection.findOne().sort({ sortOrder: -1 }).select("sortOrder").lean();
      section.sortOrder = (last?.sortOrder ?? -1) + 1; // new sections go to the end
    }
    if (req.files?.image?.[0]) section.image = await upload(req.files.image[0]);
    if (req.files?.mobileImage?.[0]) section.mobileImage = await upload(req.files.mobileImage[0]);
    await section.save();
    res.status(201).json({ success: true, message: "Section added.", data: section });
  } catch (error) {
    sendError(res, error);
  }
};

// PUT /api/v1/admin/home/sections/:id
export const updateSection = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return notFound(res, "Section");
    const section = await HomeSection.findById(req.params.id);
    if (!section) return notFound(res, "Section");
    section.set(readSection(req.body));

    const old = [];
    for (const key of ["image", "mobileImage"]) {
      const file = req.files?.[key]?.[0];
      if (file) {
        old.push(section[key]?.publicId);
        section[key] = await upload(file);
      }
      // "removeImage=true" / "removeMobileImage=true" clears one
      if (!file && String(req.body[key === "image" ? "removeImage" : "removeMobileImage"]) === "true") {
        old.push(section[key]?.publicId);
        section[key] = {};
      }
    }
    await section.save();
    for (const id of old) if (id) await destroyFromCloudinary(id).catch(() => {});
    res.status(200).json({ success: true, message: "Section updated.", data: section });
  } catch (error) {
    sendError(res, error);
  }
};

// PUT /api/v1/admin/home/sections/reorder   body: { order: [id, ...] }
export const reorderSections = async (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order) || order.length > 200 || !order.every(isObjectId)) throw fail(400, "order must be a list of section ids.");
    await HomeSection.bulkWrite(order.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { $set: { sortOrder: i } } } })));
    res.status(200).json({ success: true, message: "Order saved." });
  } catch (error) {
    sendError(res, error);
  }
};

// DELETE /api/v1/admin/home/sections/:id
export const deleteSection = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return notFound(res, "Section");
    const section = await HomeSection.findByIdAndDelete(req.params.id);
    if (!section) return notFound(res, "Section");
    for (const img of [section.image, section.mobileImage]) if (img?.publicId) await destroyFromCloudinary(img.publicId).catch(() => {});
    res.status(200).json({ success: true, message: "Section deleted." });
  } catch (error) {
    sendError(res, error);
  }
};

// ─── Admin: announcements ─────────────────────────────────────────────────

const ANNOUNCEMENT_FIELDS = ["text", "link", "isActive", "sortOrder", "startsAt", "endsAt"];
const readAnnouncement = (body) => {
  const data = {};
  for (const f of ANNOUNCEMENT_FIELDS) {
    if (body[f] === undefined) continue;
    data[f] = f === "startsAt" || f === "endsAt" ? dateOrNull(body[f]) : body[f];
  }
  return data;
};

export const listAnnouncements = async (_req, res) => {
  try {
    res.status(200).json({ success: true, data: await Announcement.find().sort({ sortOrder: 1, createdAt: -1 }) });
  } catch (error) {
    sendError(res, error);
  }
};

export const createAnnouncement = async (req, res) => {
  try {
    const item = await Announcement.create(readAnnouncement(req.body));
    res.status(201).json({ success: true, message: "Announcement added.", data: item });
  } catch (error) {
    sendError(res, error);
  }
};

export const updateAnnouncement = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return notFound(res, "Announcement");
    const item = await Announcement.findById(req.params.id);
    if (!item) return notFound(res, "Announcement");
    item.set(readAnnouncement(req.body));
    await item.save();
    res.status(200).json({ success: true, message: "Announcement updated.", data: item });
  } catch (error) {
    sendError(res, error);
  }
};

export const deleteAnnouncement = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return notFound(res, "Announcement");
    const item = await Announcement.findByIdAndDelete(req.params.id);
    if (!item) return notFound(res, "Announcement");
    res.status(200).json({ success: true, message: "Announcement deleted." });
  } catch (error) {
    sendError(res, error);
  }
};
