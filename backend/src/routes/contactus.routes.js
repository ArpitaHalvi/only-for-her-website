import { Router } from "express";
import { requirePermission } from "../middleware/authMiddleware.js";
import { contactLimiter } from "../middleware/rateLimiters.js";

import {
  createContactUs,
  getAllContactUs,
  getContactUsById,
  updateContactUs,
  partiallyUpdateContactUs,
  destroyContactUsById,
  respondToContactUs,
} from "../controllers/contactus.controller.js";

const router = Router();

/* ---------------------- PUBLIC ROUTE ---------------------- */
// Create new contact message (Public)
router.post("/", contactLimiter, createContactUs);

/* ---------------------- ADMIN ROUTES ---------------------- */

// Get paginated contact messages
router.get("/", requirePermission("contact"), getAllContactUs);

// Get contact message by ID
router.get("/:id", requirePermission("contact"), getContactUsById);

// Full Update Contact (PUT)
router.put("/:id", requirePermission("contact"), updateContactUs);

// PARTIAL UPDATE Contact (PATCH) - update status, mark read, etc.
router.patch("/:id", requirePermission("contact"), partiallyUpdateContactUs);

// Admin respond to contact message
router.post("/respond/:id", requirePermission("contact"), respondToContactUs);

// Delete contact message
router.delete("/:id", requirePermission("contact"), destroyContactUsById);

export default router;
