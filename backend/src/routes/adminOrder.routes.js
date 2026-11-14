import { Router } from "express";
import { ensureAuth, requirePermission } from "../middleware/authMiddleware.js";
import {
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  updatePaymentStatus,
  addTrackingUpdate,
  refreshOrderTracking,
  refundOrderPayment,
  deleteOrder,
  getOrderStats,
  exportOrders,
} from "../controllers/adminOrder.controller.js";

import {
  adminCreditNote,
  adminInvoice,
  adminReceipt,
  createCreditNote,
} from "../controllers/invoice.controller.js";

const router = Router();

// Staff with the "orders" permission (admin, manager, support) can work orders.
// Money (refunds, payment status, credit notes) needs "refunds" (admin, manager);
// deleting an order is admin only.
router.use(requirePermission("orders"));
const money = requirePermission("refunds");

router.get("/stats", getOrderStats);
router.get("/export", exportOrders); // before /:id
router.get("/", getAllOrders);
router.get("/:id", getOrderById);
router.patch("/:id/status", updateOrderStatus);
router.patch("/:id/payment", money, updatePaymentStatus);
router.post("/:id/tracking", addTrackingUpdate);
router.post("/:id/tracking/refresh", refreshOrderTracking);
router.get("/:id/invoice", adminInvoice);
router.get("/:id/receipt", adminReceipt);
router.get("/:id/credit-notes/:number", adminCreditNote);
router.post("/:id/credit-note", money, createCreditNote);
router.post("/:id/refund", money, refundOrderPayment);
router.delete("/:id", ensureAuth, deleteOrder);

export default router;
