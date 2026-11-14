import { Router } from "express";
import upload from "../config/multer.js";
import { ensureCustomer } from "../middleware/customerAuthMiddleware.js";
import { requirePermission } from "../middleware/authMiddleware.js";
import { returnLimiter } from "../middleware/rateLimiters.js";
import {
  createReturn,
  getMyReturns,
  getMyReturn,
  getEligibility,
  cancelMyReturn,
  getAllReturns,
  getReturn,
  updateReturnStatus,
} from "../controllers/return.controller.js";

// Mounted at /api/v1/returns (signed-in customers)
export const customerReturnRouter = Router();
customerReturnRouter.use(ensureCustomer);
customerReturnRouter.post("/", returnLimiter, upload.fields([{ name: "photos", maxCount: 4 }]), createReturn);
customerReturnRouter.get("/my", getMyReturns);
customerReturnRouter.get("/my/:id", getMyReturn);
customerReturnRouter.get("/eligibility/:orderId", getEligibility);
customerReturnRouter.patch("/my/:id/cancel", cancelMyReturn);

// Mounted at /api/v1/admin/returns (staff with the "returns" permission)
export const adminReturnRouter = Router();
adminReturnRouter.use(requirePermission("returns"));
adminReturnRouter.get("/", getAllReturns);
adminReturnRouter.get("/:id", getReturn);
adminReturnRouter.patch("/:id/status", updateReturnStatus);
