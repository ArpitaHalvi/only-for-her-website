import express from "express";
import { ensureAuth } from "../middleware/authMiddleware.js";
import {
  createProductAttribute,
  deleteProductAttribute,
  getProductAttributeBySlugOrId,
  getProductAttributes,
  updateProductAttribute,
} from "../controllers/productAttribute.controller.js";

const router = express.Router();

// Public
router.get("/", getProductAttributes);
router.get("/:slugOrId", getProductAttributeBySlugOrId);

// Admin
router.post("/", ensureAuth, createProductAttribute);
router.put("/:id", ensureAuth, updateProductAttribute);
router.delete("/:id", ensureAuth, deleteProductAttribute);

export default router;
