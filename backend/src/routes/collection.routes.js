import express from "express";
import upload from "../config/multer.js";
import { requirePermission } from "../middleware/authMiddleware.js";
import {
  getCollections,
  getCollection,
  getAdminCollections,
  createCollection,
  updateCollection,
  deleteCollection,
  getCollectionProducts,
  assignCollectionProducts,
  reorderCollections,
} from "../controllers/collection.controller.js";

const router = express.Router();
const catalog = requirePermission("catalog");
const images = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "banner", maxCount: 1 },
]);

// Public
router.get("/", getCollections);
router.get("/admin/list", catalog, getAdminCollections); // before /:slugOrId
router.get("/admin/:id/products", catalog, getCollectionProducts);
router.put("/reorder", catalog, reorderCollections); // before /:id
router.get("/:slugOrId", getCollection);

// Catalogue staff
router.post("/", catalog, images, createCollection);
router.post("/:id/products", catalog, assignCollectionProducts);
router.put("/:id", catalog, images, updateCollection);
router.patch("/:id", catalog, images, updateCollection);
router.delete("/:id", catalog, deleteCollection);

export default router;
