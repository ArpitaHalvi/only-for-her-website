import { Router } from "express";
import { requirePermission } from "../middleware/authMiddleware.js";
import { getDashboard, getReport } from "../controllers/analytics.controller.js";

// Mounted at /api/v1/admin (dashboard is open to all staff; money figures need "reports")
const router = Router();
router.get("/dashboard", requirePermission("dashboard"), getDashboard);
router.get("/reports/:type", requirePermission("reports"), getReport);

export default router;
