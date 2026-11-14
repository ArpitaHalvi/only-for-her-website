import { Router } from "express";
import { requirePermission } from "../middleware/authMiddleware.js";
import { listCustomers, exportCustomers, getCustomer, updateCustomer } from "../controllers/customerAdmin.controller.js";

// Mounted at /api/v1/admin/customers
const router = Router();
router.use(requirePermission("customers"));
router.get("/", listCustomers);
router.get("/export", requirePermission("customers_pii"), exportCustomers); // before /:id
router.get("/:id", getCustomer);
router.patch("/:id", updateCustomer);

export default router;
