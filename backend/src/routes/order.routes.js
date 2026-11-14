import { Router } from "express";
import rateLimit from "express-rate-limit";
import { ensureCustomer, ensureCustomerOrGuest, optionalCustomerOrGuest } from "../middleware/customerAuthMiddleware.js";
import { createGuestSession } from "../controllers/guestCheckout.controller.js";
import { checkoutLimiter } from "../middleware/rateLimiters.js";
import {
  quoteOrder,
  checkout,
  verifyPayment,
  razorpayWebhook,
  getMyOrders,
  getMyOrderById,
  cancelMyOrder,
  payMyOrder,
  trackOrder,
} from "../controllers/order.controller.js";

import { myCreditNote, myInvoice, myReceipt } from "../controllers/invoice.controller.js";

const router = Router();

// Called by Razorpay, not by a customer: it proves itself with a signature
// over the raw request body (kept by the JSON parser in app.js).
router.post("/razorpay-webhook", razorpayWebhook);

// Guest tracking by order number + email/mobile. Strict limit: it answers questions about orders.
const trackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many tracking attempts. Please try again in a few minutes." },
});
router.post("/track", trackLimiter, trackOrder);

// ── Checkout: a signed-in customer OR a guest (token from /orders/guest/session) ──
router.post("/guest/session", checkoutLimiter, createGuestSession);
router.post("/quote", optionalCustomerOrGuest, quoteOrder); // anyone may price a cart
router.post("/checkout", ensureCustomerOrGuest, checkoutLimiter, checkout);
router.post("/verify-payment", ensureCustomerOrGuest, checkoutLimiter, verifyPayment);
router.get("/my/:orderId", ensureCustomerOrGuest, getMyOrderById);
router.post("/my/:orderId/pay", ensureCustomerOrGuest, checkoutLimiter, payMyOrder);
router.get("/my/:orderId/invoice", ensureCustomerOrGuest, myInvoice);
router.get("/my/:orderId/receipt", ensureCustomerOrGuest, myReceipt);

// ── Everything below needs a signed-in customer ──
router.use(ensureCustomer);

router.get("/my", getMyOrders);
router.patch("/my/:orderId/cancel", cancelMyOrder);
router.get("/my/:orderId/credit-notes/:number", myCreditNote);

export default router;
