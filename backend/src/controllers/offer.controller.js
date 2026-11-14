import Offer from "../models/offer.model.js";
import {
  uploadToCloudinary,
  destroyFromCloudinary,
} from "../utils/cloudinaryService.js";

const CLOUDINARY_FOLDER = "only-for-her/offers";

const EDITABLE_FIELDS = ["title", "subtitle", "ctaText", "placement", "link", "isActive", "sortOrder", "startsAt", "endsAt"];

const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v));

const pickFields = (body) => {
  const data = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] === undefined) continue;
    // multipart forms send empty dates as ""
    data[field] =
      (field === "startsAt" || field === "endsAt") && (body[field] === "" || body[field] === "null")
        ? null
        : body[field];
  }
  return data;
};

const upload = async (file) => {
  const result = await uploadToCloudinary(file.path || file.buffer, CLOUDINARY_FOLDER);
  return { url: result.secure_url || result.url, publicId: result.public_id };
};

const sendError = (res, error) => {
  if (error.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: Object.values(error.errors).map((e) => e.message).join(" "),
    });
  }
  return res.status(error.status || 500).json({ success: false, message: error.status && error.status < 500 ? error.message : "Internal Server Error" });
};

const notFound = (res) => res.status(404).json({ success: false, message: "Offer not found" });

// @desc    Banners to show now: active and inside their schedule, in display order
// @route   GET /api/v1/offers/active
// @access  Public
export const getActiveOffers = async (req, res) => {
  try {
    const now = new Date();
    const offers = await Offer.find({
      isActive: true,
      ...(["hero", "promo"].includes(req.query.placement) ? { placement: req.query.placement } : {}),
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
      ],
    })
      .sort({ sortOrder: 1, createdAt: -1 })
      .select("title subtitle ctaText placement image mobileImage link");

    res.status(200).json({ success: true, data: offers });
  } catch (error) {
    console.error("[offer.controller.js]", error.message);
    sendError(res, error);
  }
};

// @desc    All offers (admin)
// @route   GET /api/v1/offers
// @access  Private/Admin
export const listOffers = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const query = {};
    if (req.query.search) {
      query.title = { $regex: String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    }

    const total = await Offer.countDocuments(query);
    const offers = await Offer.find(query)
      .sort({ sortOrder: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.status(200).json({
      success: true,
      data: offers,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("[offer.controller.js]", error.message);
    sendError(res, error);
  }
};

// @route   GET /api/v1/offers/:id
// @access  Private/Admin
export const getOffer = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return notFound(res);
    const offer = await Offer.findById(req.params.id);
    if (!offer) return notFound(res);
    res.status(200).json({ success: true, data: offer });
  } catch (error) {
    console.error("[offer.controller.js]", error.message);
    sendError(res, error);
  }
};

// @route   POST /api/v1/offers   (multipart: fields + `image`)
// @access  Private/Admin
export const createOffer = async (req, res) => {
  try {
    const image = req.files?.image?.[0];
    if (!image) {
      return res.status(400).json({ success: false, message: "A banner image is required." });
    }
    const offer = new Offer(pickFields(req.body));
    offer.image = await upload(image);
    const mobile = req.files?.mobileImage?.[0];
    if (mobile) offer.mobileImage = await upload(mobile);
    await offer.save();
    res.status(201).json({ success: true, message: "Offer created successfully", data: offer });
  } catch (error) {
    console.error("[offer.controller.js]", error.message);
    sendError(res, error);
  }
};

// @route   PUT /api/v1/offers/:id   (multipart: fields + optional `image`)
// @access  Private/Admin
export const updateOffer = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return notFound(res);
    const offer = await Offer.findById(req.params.id);
    if (!offer) return notFound(res);

    offer.set(pickFields(req.body));

    let oldImage;
    const image = req.files?.image?.[0];
    if (image) {
      oldImage = offer.image;
      offer.image = await upload(image);
    }
    let oldMobile;
    const mobile = req.files?.mobileImage?.[0];
    if (mobile) {
      oldMobile = offer.mobileImage;
      offer.mobileImage = await upload(mobile);
    }
    await offer.save();
    // only after the new data is safely saved
    if (oldImage?.publicId) await destroyFromCloudinary(oldImage.publicId).catch(() => {});
    if (oldMobile?.publicId) await destroyFromCloudinary(oldMobile.publicId).catch(() => {});

    res.status(200).json({ success: true, message: "Offer updated successfully", data: offer });
  } catch (error) {
    console.error("[offer.controller.js]", error.message);
    sendError(res, error);
  }
};

// @route   DELETE /api/v1/offers/:id
// @access  Private/Admin
export const deleteOffer = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return notFound(res);
    const offer = await Offer.findByIdAndDelete(req.params.id);
    if (!offer) return notFound(res);
    if (offer.image?.publicId) await destroyFromCloudinary(offer.image.publicId).catch(() => {});
    if (offer.mobileImage?.publicId) await destroyFromCloudinary(offer.mobileImage.publicId).catch(() => {});
    res.status(200).json({ success: true, message: "Offer deleted successfully" });
  } catch (error) {
    console.error("[offer.controller.js]", error.message);
    sendError(res, error);
  }
};
