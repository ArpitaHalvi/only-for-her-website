import { Router } from "express";
import { ensureAuth } from "../middleware/authMiddleware.js";
import { listStaff, updateStaff } from "../controllers/staff.controller.js";

const router = Router();

// Admin only: who can sign in to the back office, and with which role
router.get("/", ensureAuth, listStaff);
router.patch("/:id", ensureAuth, updateStaff);

export default router;
