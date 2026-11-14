import express from "express";
const router = express.Router();
import upload from "../config/multer.js";
import { requirePermission } from "../middleware/authMiddleware.js";
import {
  createProduct,
  deleteProduct,
  getAdminProducts,
  getAllProducts,
  getProductById,
  getProductFilters,
  getProductsByIds,
  compareProducts,
  getRelatedProducts,
  patchProductPartial,
  updateProductFull,
} from "../controllers/product.controller.js";

const productImages = upload.fields([
  { name: "thumbnail", maxCount: 1 },
  { name: "gallery", maxCount: 8 },
]);

// Managers (and admins) can run the catalogue
const catalog = requirePermission("catalog");

// Public Pipeline API
router.get("/", getAllProducts);
router.get("/filters", getProductFilters); // before /:slugOrId
router.get("/by-ids", getProductsByIds);
router.get("/compare", compareProducts);
router.get("/admin/list", catalog, getAdminProducts); // before /:slugOrId
router.get("/:slugOrId/related", getRelatedProducts);
router.get("/:slugOrId", getProductById);

// Catalogue management
router.post("/", catalog, productImages, createProduct);
router.put("/:id", catalog, productImages, updateProductFull);
router.patch("/:id", catalog, patchProductPartial);
router.delete("/:id", catalog, deleteProduct);

export default router;
