/**
 * customerAuth.routes.js
 *
 * All routes are under /api/v1/customer
 * Completely separate from the admin /api/v1/auth routes.
 */

import { Router } from "express";
import passport from "passport";
import {
  sendEmailOTP,
  verifyEmailOTP,
  googleCallback,
  getMyProfile,
  updateMyProfile,
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
} from "../controllers/customerAuth.controller.js";
import { mergeWishlist, getRecentlyViewed, mergeRecentlyViewed, addRecentlyViewed } from "../controllers/customerExtras.controller.js";
import { ensureCustomer } from "../middleware/customerAuthMiddleware.js";
import { otpSendLimiter, otpVerifyLimiter } from "../middleware/rateLimiters.js";
import { isGoogleCustomerConfigured } from "../config/customerPassport.js";

const router = Router();

// Which sign-in methods this server has set up (so the page only offers working ones)
router.get("/auth/providers", (_req, res) => {
  res.status(200).json({ success: true, data: { google: isGoogleCustomerConfigured, emailOtp: true } });
});

// ── Email OTP auth ─────────────────────────────────────────────────────────
router.post("/auth/send-otp", otpSendLimiter, sendEmailOTP);
router.post("/auth/verify-otp", otpVerifyLimiter, verifyEmailOTP);

// ── Google OAuth — only mount if credentials are configured ───────────────
if (isGoogleCustomerConfigured) {
  router.get(
    "/auth/google",
    passport.authenticate("google-customer", {
      scope: ["profile", "email"],
      session: false,
    }),
  );

  router.get(
    "/auth/google/callback",
    passport.authenticate("google-customer", {
      failureRedirect: `${process.env.NEXT_FRONTEND_URL}/auth?error=google_failed`,
      session: false,
    }),
    googleCallback,
  );
} else {
  // The sign-in page shows a clear message instead of the visitor landing on raw JSON
  router.get("/auth/google", (_req, res) => {
    res.redirect(
      `${process.env.NEXT_FRONTEND_URL}/auth?error=google_not_configured`,
    );
  });
  router.get("/auth/google/callback", (_req, res) => {
    res.redirect(
      `${process.env.NEXT_FRONTEND_URL}/auth?error=google_not_configured`,
    );
  });
}

// ── Authenticated customer routes ──────────────────────────────────────────
router.get("/me", ensureCustomer, getMyProfile);
router.patch("/me", ensureCustomer, updateMyProfile);

// Wishlist
router.get("/me/wishlist", ensureCustomer, getWishlist);
router.post("/me/wishlist/merge", ensureCustomer, mergeWishlist); // before /:productId
router.post("/me/wishlist/:productId", ensureCustomer, addToWishlist);
router.delete("/me/wishlist/:productId", ensureCustomer, removeFromWishlist);

// Recently viewed
router.get("/me/recently-viewed", ensureCustomer, getRecentlyViewed);
router.post("/me/recently-viewed", ensureCustomer, mergeRecentlyViewed);
router.post("/me/recently-viewed/:productId", ensureCustomer, addRecentlyViewed);

// Addresses
router.get("/me/addresses", ensureCustomer, getAddresses);
router.post("/me/addresses", ensureCustomer, addAddress);
router.put("/me/addresses/:addressId", ensureCustomer, updateAddress);
router.delete("/me/addresses/:addressId", ensureCustomer, deleteAddress);

export default router;
