import { Router } from "express";
import {
  getProductReviews,
  getMyReviewStatus,
  createReview,
  updateReview,
  deleteReview,
  getAllReviews,
  adminUpdateReview,
  adminDeleteReview,
  adminReplyToReview,
  reportReview,
} from "../controllers/review.controller.js";
import { ensureCustomer } from "../middleware/customerAuthMiddleware.js";
import { requirePermission } from "../middleware/authMiddleware.js";
import { reviewLimiter } from "../middleware/rateLimiters.js";
import upload from "../config/multer.js";

const router = Router();

// ── Public ────────────────────────────────────────────────────────────────────
router.get("/product/:productId", getProductReviews);
router.get("/product/:productId/mine", ensureCustomer, getMyReviewStatus);

// ── Admin ─────────────────────────────────────────────────────────────────────
router.get("/", requirePermission("reviews"), getAllReviews);
router.patch("/:id/admin", requirePermission("reviews"), adminUpdateReview);
router.delete("/:id/admin", requirePermission("reviews"), adminDeleteReview);
router.post("/:id/reply", requirePermission("reviews"), adminReplyToReview);

// ── Customer ──────────────────────────────────────────────────────────────────
router.post("/", ensureCustomer, reviewLimiter, upload.fields([{ name: "photos", maxCount: 3 }]), createReview);
router.post("/:id/report", ensureCustomer, reviewLimiter, reportReview);
router.patch("/:id", ensureCustomer, reviewLimiter, updateReview);
router.delete("/:id", ensureCustomer, deleteReview);

export default router;
