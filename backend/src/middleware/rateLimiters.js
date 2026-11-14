import rateLimit from "express-rate-limit";

/**
 * Per-route limits, applied on top of the global limiter in app.js.
 * They are keyed by client IP (app.js sets "trust proxy" so that is the real
 * visitor and not the reverse proxy).
 */
const limiter = ({ windowMs, max, message, ...rest }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, status: "error", message },
    ...rest,
  });

const MIN = 60 * 1000;

// Admin sign-in: only failed attempts count toward the limit
export const loginLimiter = limiter({
  windowMs: 15 * MIN,
  max: 10,
  skipSuccessfulRequests: true,
  message: "Too many login attempts. Please try again in 15 minutes.",
});

// Creating back-office accounts
export const registerLimiter = limiter({
  windowMs: 60 * MIN,
  max: 10,
  message: "Too many attempts. Please try again later.",
});

// Asking for a login code (each one sends an email)
export const otpSendLimiter = limiter({
  windowMs: 15 * MIN,
  max: 6,
  message: "Too many code requests. Please wait a few minutes and try again.",
});

// Guessing a login code
export const otpVerifyLimiter = limiter({
  windowMs: 15 * MIN,
  max: 15,
  message: "Too many attempts. Please wait a few minutes and try again.",
});

// Public contact form
export const contactLimiter = limiter({
  windowMs: 60 * MIN,
  max: 8,
  message: "Too many messages sent. Please try again later.",
});

// Placing / paying for orders
export const checkoutLimiter = limiter({
  windowMs: 15 * MIN,
  max: 30,
  message: "Too many checkout attempts. Please try again in a few minutes.",
});

// Posting / editing reviews
export const reviewLimiter = limiter({
  windowMs: 60 * MIN,
  max: 20,
  message: "Too many review submissions. Please try again later.",
});

// "Email me when it is back in stock" (each sign-up can later send an email)
export const alertLimiter = limiter({
  windowMs: 60 * MIN,
  max: 15,
  message: "Too many requests. Please try again later.",
});

// Customers asking for a return / exchange
export const returnLimiter = limiter({
  windowMs: 60 * MIN,
  max: 10,
  message: "Too many return requests. Please try again later.",
});

// Admin uploads
export const uploadLimiter = limiter({
  windowMs: 15 * MIN,
  max: 60,
  message: "Too many uploads. Please try again in a few minutes.",
});
