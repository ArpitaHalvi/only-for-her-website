import express from "express";
const router = express.Router();
import {
  createProductCategory,
  deleteProductCategory,
  getAdminProductCategories,
  getAllProductCategories,
  getProductCategories,
  getProductCategoryBySlugOrId,
  partiallyUpdateProductCategory,
  updateProductCategory,
} from "../controllers/productCategory.controller.js";
import { ensureAuth } from "../middleware/authMiddleware.js";
import upload from "../config/multer.js";

const categoryImages = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "banner", maxCount: 1 },
]);

// Public routes
router.get("/", getProductCategories);
router.get("/all", ensureAuth, getAllProductCategories);
router.get("/admin/list", ensureAuth, getAdminProductCategories);
router.get("/:slugOrId", getProductCategoryBySlugOrId);

// Admin-only protected routes
router.post("/", ensureAuth, categoryImages, createProductCategory);
router.put("/:id", ensureAuth, categoryImages, updateProductCategory);
router.patch(
  "/:id",
  ensureAuth,
  categoryImages,
  partiallyUpdateProductCategory,
);
router.delete("/:id", ensureAuth, deleteProductCategory);

export default router;
