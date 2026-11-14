import { Router } from "express";
import { login, logout, register } from "../controllers/auth.controller.js";
import {
  ensureAuth,
  ensureAdminUnlessNoUsers,
} from "../middleware/authMiddleware.js";
import { loginLimiter, registerLimiter } from "../middleware/rateLimiters.js";

const router = Router();

// Creating an account needs an admin token (except for the very first account
// on an empty database), so strangers can not make themselves admins.
router.post("/register", registerLimiter, ensureAdminUnlessNoUsers, register);
router.post("/login", loginLimiter, login);
router.post("/logout", ensureAuth, logout);

export default router;
