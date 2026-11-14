import { Router } from "express";
import { requirePermission } from "../middleware/authMiddleware.js";
import { alertLimiter } from "../middleware/rateLimiters.js";
import {
  getLowStock,
  adjustStock,
  getMovements,
  getStockAlerts,
  subscribeStockAlert,
} from "../controllers/inventory.controller.js";

// Mounted at /api/v1/admin/inventory (staff with the "inventory" permission)
export const adminInventoryRouter = Router();
adminInventoryRouter.use(requirePermission("inventory"));
adminInventoryRouter.get("/low-stock", getLowStock);
adminInventoryRouter.get("/movements", getMovements);
adminInventoryRouter.get("/alerts", getStockAlerts);
adminInventoryRouter.post("/:productId/adjust", adjustStock);

// Mounted at /api/v1/stock-alerts (public: "email me when it is back")
export const stockAlertRouter = Router();
stockAlertRouter.post("/", alertLimiter, subscribeStockAlert);
