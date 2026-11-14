import { Router } from "express";
import rateLimit from "express-rate-limit";
import { chat } from "../controllers/chat.controller.js";

const router = Router();

// Every reply costs money, so each visitor gets a modest allowance
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "You are asking too quickly. Please wait a moment." },
});

router.post("/", chatLimiter, chat);

export default router;
