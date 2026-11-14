import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requirePermission } from "../middleware/authMiddleware.js";
import { lookupPincode, listAreas, createArea, bulkSaveAreas, updateArea, deleteArea } from "../controllers/serviceArea.controller.js";

// Mounted at /api/v1/serviceability (public)
export const publicServiceRouter = Router();
const lookupLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many checks. Please wait a moment." } });
publicServiceRouter.get("/:pincode", lookupLimiter, lookupPincode);

// Mounted at /api/v1/admin/serviceability (staff with the "shipping" permission)
export const adminServiceRouter = Router();
adminServiceRouter.use(requirePermission("shipping"));
adminServiceRouter.get("/", listAreas);
adminServiceRouter.post("/", createArea);
adminServiceRouter.post("/bulk", bulkSaveAreas); // before /:id
adminServiceRouter.put("/:id", updateArea);
adminServiceRouter.delete("/:id", deleteArea);
