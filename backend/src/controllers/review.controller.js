import Review from "../models/review.model.js";
import Order from "../models/order.model.js";
import { uploadToCloudinary, destroyFromCloudinary } from "../utils/cloudinaryService.js";
import { isAllowedFileOnDisk, removeFile } from "../utils/fileSignature.js";

const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v));

// Page / limit from the query string, clamped so one request can not ask for everything
const pageParams = (query, defaultLimit) => {
  const page = Math.min(Math.max(parseInt(query.page) || 1, 1), 10000);
  const limit = Math.min(Math.max(parseInt(query.limit) || defaultLimit, 1), 50);
  return { page, limit, skip: (page - 1) * limit };
};

const validRating = (v) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 5;
const serverError = (res, err) => {
  console.error("review error:", err.message);
  return res.status(500).json({ success: false, message: "Server error." });
};

// A delivered order containing the product
const hasPurchased = async (customerId, productId) =>
  !!(await Order.exists({ customer: customerId, status: "delivered", "items.product": productId }));

// ─── Public ───────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/reviews/product/:productId
 * Returns approved reviews for a product, newest first.
 */
export const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    if (!isObjectId(productId)) {
      return res.status(400).json({ success: false, message: "Invalid product." });
    }
    const { page, limit, skip } = pageParams(req.query, 10);

    const total = await Review.countDocuments({ product: productId, isApproved: true });
    const reviews = await Review.find({ product: productId, isApproved: true })
      .select("-reports -reportCount")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return res.status(200).json({
      success: true,
      data: reviews,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    return serverError(res, err);
  }
};

// ─── Customer ─────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/reviews/product/:productId/mine
 * Can the signed-in customer review this product, and have they already?
 */
export const getMyReviewStatus = async (req, res) => {
  try {
    const { productId } = req.params;
    if (!isObjectId(productId)) {
      return res.status(400).json({ success: false, message: "Invalid product." });
    }
    const [review, purchased] = await Promise.all([
      Review.findOne({ product: productId, customer: req.customer._id }).lean(),
      hasPurchased(req.customer._id, productId),
    ]);
    return res.status(200).json({
      success: true,
      data: { purchased, canReview: purchased && !review, review },
    });
  } catch (err) {
    return serverError(res, err);
  }
};

/**
 * POST /api/v1/reviews
 * Create a review. Customer must have a delivered order containing the product.
 * Body: { productId, rating, title?, body }
 */
export const createReview = async (req, res) => {
  const photoFiles = (req.files?.photos || []).slice(0, 3);
  const uploaded = [];
  try {
    const { productId, rating, title, body } = req.body;
    const customer = req.customer;

    if (!productId || !rating || typeof body !== "string" || !body.trim()) {
      return res.status(400).json({
        success: false,
        message: "productId, rating, and body are required.",
      });
    }
    if (!isObjectId(productId)) {
      return res.status(400).json({ success: false, message: "Invalid product." });
    }
    if (!validRating(rating)) {
      return res.status(400).json({ success: false, message: "Rating must be a whole number from 1 to 5." });
    }
    if (body.length > 2000 || (title !== undefined && (typeof title !== "string" || title.length > 120))) {
      return res.status(400).json({ success: false, message: "Your review is too long." });
    }

    // Check if this customer already reviewed this product
    const existing = await Review.findOne({ product: productId, customer: customer._id });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "You have already reviewed this product.",
      });
    }

    // Only customers who received the product can review it
    if (!(await hasPurchased(customer._id, productId))) {
      return res.status(403).json({
        success: false,
        message: "Only customers who have received this product can review it.",
      });
    }

    // Photos: real images only
    for (const file of photoFiles) {
      if (!(await isAllowedFileOnDisk(file.path))) {
        return res.status(400).json({ success: false, message: "Photos must be JPG, PNG, GIF or WebP images." });
      }
    }
    for (const file of photoFiles) {
      const up = await uploadToCloudinary(file.path, "only-for-her/reviews");
      uploaded.push({ url: up.secure_url, publicId: up.public_id });
    }

    const review = await Review.create({
      product: productId,
      customer: customer._id,
      customerName: customer.name || customer.email?.split("@")[0] || "Customer",
      customerAvatar: customer.avatar,
      rating: Number(rating),
      title: typeof title === "string" ? title.trim() : undefined,
      body: body.trim(),
      verified: true,
      photos: uploaded,
      // A review with photos is checked by the shop before it goes live
      isApproved: uploaded.length === 0,
    });

    return res.status(201).json({
      success: true,
      message: uploaded.length ? "Thank you! Your review will appear once it has been checked." : "Review submitted successfully.",
      data: review,
    });
  } catch (err) {
    // The review was not saved: do not leave its photos on Cloudinary
    await Promise.all(uploaded.map((p) => destroyFromCloudinary(p.publicId).catch(() => {})));
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "You have already reviewed this product.",
      });
    }
    return serverError(res, err);
  } finally {
    await Promise.all(photoFiles.map((f) => removeFile(f.path)));
  }
};

/**
 * PATCH /api/v1/reviews/:id
 * Customer edits their own review.
 * Body: { rating?, title?, body? }
 */
export const updateReview = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid review." });
    }
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found." });
    }
    if (review.customer.toString() !== req.customer._id.toString()) {
      return res.status(403).json({ success: false, message: "Not your review." });
    }

    const { rating, title, body } = req.body;
    if (rating !== undefined && !validRating(rating)) {
      return res.status(400).json({ success: false, message: "Rating must be a whole number from 1 to 5." });
    }
    if (
      (title !== undefined && (typeof title !== "string" || title.length > 120)) ||
      (body !== undefined && (typeof body !== "string" || !body.trim() || body.length > 2000))
    ) {
      return res.status(400).json({ success: false, message: "Invalid review text." });
    }
    if (rating !== undefined) review.rating = Number(rating);
    if (title !== undefined) review.title = title.trim();
    if (body !== undefined) review.body = body.trim();

    await review.save();
    return res.status(200).json({ success: true, data: review });
  } catch (err) {
    return serverError(res, err);
  }
};

/**
 * DELETE /api/v1/reviews/:id
 * Customer deletes their own review.
 */
export const deleteReview = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid review." });
    }
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found." });
    }
    if (review.customer.toString() !== req.customer._id.toString()) {
      return res.status(403).json({ success: false, message: "Not your review." });
    }

    await Promise.all((review.photos || []).map((p) => destroyFromCloudinary(p.publicId).catch(() => {})));
    await review.deleteOne();
    return res.status(200).json({ success: true, message: "Review deleted." });
  } catch (err) {
    return serverError(res, err);
  }
};

// ─── Admin ────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/reviews
 * Admin: get all reviews with pagination.
 */
export const getAllReviews = async (req, res) => {
  try {
    const { page, limit, skip } = pageParams(req.query, 20);

    // status: pending | approved (admin Approve / Reject); reported=true; product; rating; search
    const q = {};
    if (req.query.status === "approved") q.isApproved = true;
    if (req.query.status === "pending" || req.query.status === "rejected") q.isApproved = false;
    if (req.query.reported === "true") q.reportCount = { $gt: 0 };
    if (req.query.verified === "true") q.verified = true;
    if (isObjectId(req.query.product)) q.product = req.query.product;
    if (validRating(req.query.rating)) q.rating = Number(req.query.rating);
    if (req.query.replied === "false") q.reply = { $exists: false };
    if (req.query.search) {
      const rx = { $regex: String(req.query.search).trim().slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
      q.$or = [{ body: rx }, { title: rx }, { customerName: rx }];
    }

    const total = await Review.countDocuments(q);
    const reviews = await Review.find(q)
      .select("+reports")
      .populate("product", "name slug thumbnail")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return res.status(200).json({
      success: true,
      data: reviews,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    return serverError(res, err);
  }
};

/**
 * PATCH /api/v1/reviews/:id/admin
 * Admin edits any review body/rating/approval.
 */
export const adminUpdateReview = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid review." });
    }
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found." });
    }

    const { rating, title, body, isApproved, dismissReports } = req.body;
    if (rating !== undefined && !validRating(rating)) {
      return res.status(400).json({ success: false, message: "Rating must be a whole number from 1 to 5." });
    }
    if (
      (title !== undefined && (typeof title !== "string" || title.length > 120)) ||
      (body !== undefined && (typeof body !== "string" || body.length > 2000)) ||
      (isApproved !== undefined && typeof isApproved !== "boolean")
    ) {
      return res.status(400).json({ success: false, message: "Invalid review data." });
    }
    if (rating !== undefined) review.rating = Number(rating);
    if (title !== undefined) review.title = title.trim();
    if (body !== undefined) review.body = body.trim();
    if (isApproved !== undefined) review.isApproved = isApproved;
    if (dismissReports === true) {
      review.reports = [];
      review.reportCount = 0;
    }

    await review.save();
    return res.status(200).json({ success: true, data: review });
  } catch (err) {
    return serverError(res, err);
  }
};

/**
 * DELETE /api/v1/reviews/:id/admin
 * Admin deletes any review.
 */
export const adminDeleteReview = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid review." });
    }
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found." });
    }
    await Promise.all((review.photos || []).map((p) => destroyFromCloudinary(p.publicId).catch(() => {})));
    return res.status(200).json({ success: true, message: "Review deleted by admin." });
  } catch (err) {
    return serverError(res, err);
  }
};

/**
 * POST /api/v1/reviews/:id/reply   (staff with "reviews")  Body: { text }
 * Public answer under a review. An empty text removes the reply.
 */
export const adminReplyToReview = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid review." });
    const { text } = req.body;
    if (typeof text !== "string" || text.length > 1000) return res.status(400).json({ success: false, message: "The reply must be text of up to 1000 characters." });
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: "Review not found." });
    review.reply = text.trim() ? { text: text.trim(), at: new Date(), by: req.user?.name || "Shop" } : undefined;
    await review.save();
    return res.status(200).json({ success: true, message: text.trim() ? "Reply saved." : "Reply removed.", data: review });
  } catch (err) {
    return serverError(res, err);
  }
};

/**
 * POST /api/v1/reviews/:id/report   (signed-in customer)  Body: { reason? }
 * Flags a review for the shop to look at. One report per customer per review.
 */
export const reportReview = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid review." });
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim().slice(0, 300) : "";
    const review = await Review.findOne({ _id: req.params.id, isApproved: true }).select("+reports");
    if (!review) return res.status(404).json({ success: false, message: "Review not found." });
    if (String(review.customer) === String(req.customer._id)) return res.status(400).json({ success: false, message: "You cannot report your own review." });
    if (review.reports.some((r) => String(r.customer) === String(req.customer._id)))
      return res.status(200).json({ success: true, message: "Thanks, we are already looking at this review." });
    review.reports.push({ customer: req.customer._id, reason });
    review.reportCount = review.reports.length;
    await review.save();
    return res.status(200).json({ success: true, message: "Thanks, we will take a look." });
  } catch (err) {
    return serverError(res, err);
  }
};
