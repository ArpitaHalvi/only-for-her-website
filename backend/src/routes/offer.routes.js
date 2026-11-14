import { Router } from "express";
import { requirePermission } from "../middleware/authMiddleware.js";
import upload from "../config/multer.js";
import {
  getActiveOffers,
  listOffers,
  getOffer,
  createOffer,
  updateOffer,
  deleteOffer,
} from "../controllers/offer.controller.js";

const router = Router();

// Public: the banners the storefront shows right now
router.get("/active", getActiveOffers);

// Admin
const image = upload.fields([{ name: "image", maxCount: 1 }, { name: "mobileImage", maxCount: 1 }]);
router.get("/", requirePermission("content"), listOffers);
router.get("/:id", requirePermission("content"), getOffer);
router.post("/", requirePermission("content"), image, createOffer);
router.put("/:id", requirePermission("content"), image, updateOffer);
router.delete("/:id", requirePermission("content"), deleteOffer);

export default router;
