import { Router } from "express";
import { requirePermission } from "../middleware/authMiddleware.js";
import {
  listCoupons,
  getCoupon,
  createCoupon,
  updateCoupon,
  deleteCoupon,
} from "../controllers/coupon.controller.js";

const router = Router();

// Admin only. Customers apply a code through POST /orders/quote and /orders/checkout.
router.use(requirePermission("marketing")); // admin and store manager
router.get("/", listCoupons);
router.get("/:id", getCoupon);
router.post("/", createCoupon);
router.put("/:id", updateCoupon);
router.delete("/:id", deleteCoupon);

export default router;
