import jwt from "jsonwebtoken";
import Customer from "../models/customer.model.js";

export const ensureCustomer = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ success: false, message: "Not authorized, token missing." });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    if (decoded.role !== "customer") {
      return res
        .status(403)
        .json({ success: false, message: "Access denied." });
    }

    req.customer = await Customer.findById(decoded.id).select(
      "-otp -otpExpiresAt -otpSentAt -otpLockedUntil -otpAttempts"
    );
    if (!req.customer) {
      return res
        .status(401)
        .json({ success: false, message: "Customer not found." });
    }

    if (req.customer.isActive === false) {
      return res
        .status(403)
        .json({ success: false, message: "This account has been blocked. Please contact us." });
    }

    next();
  } catch (error) {
    res
      .status(401)
      .json({ success: false, message: "Invalid or expired token." });
  }
};

/**
 * Like ensureCustomer, but also accepts a guest-checkout token
 * (POST /orders/guest/session). Used only on the checkout routes.
 * req.isGuest tells them apart. A guest token stops working as soon as the
 * email has been verified (the shopper signed in properly).
 */
export const ensureCustomerOrGuest = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer "))
      return res.status(401).json({ success: false, message: "Not authorized, token missing." });

    const decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET, { algorithms: ["HS256"] });
    if (decoded.role !== "customer" && decoded.role !== "guest")
      return res.status(403).json({ success: false, message: "Access denied." });

    const customer = await Customer.findById(decoded.id).select("-otp -otpExpiresAt -otpSentAt -otpLockedUntil -otpAttempts");
    if (!customer) return res.status(401).json({ success: false, message: "Customer not found." });
    if (customer.isActive === false)
      return res.status(403).json({ success: false, message: "This account has been blocked. Please contact us." });
    if (decoded.role === "guest" && (!customer.isGuest || customer.isVerified))
      return res.status(401).json({ success: false, message: "Please sign in to continue." });

    req.customer = customer;
    req.isGuest = decoded.role === "guest";
    next();
  } catch {
    res.status(401).json({ success: false, message: "Invalid or expired token." });
  }
};

/**
 * For routes that work for anyone but know more when signed in (pricing a cart with a coupon):
 * a valid customer or guest token sets req.customer / req.isGuest; no token, or a bad one,
 * simply carries on without them.
 */
export const optionalCustomerOrGuest = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return next();
  try {
    const decoded = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET, { algorithms: ["HS256"] });
    if (decoded.role === "customer" || decoded.role === "guest") {
      const customer = await Customer.findById(decoded.id).select("-otp -otpExpiresAt -otpSentAt -otpLockedUntil -otpAttempts");
      const usable = customer && customer.isActive !== false && (decoded.role === "customer" || (customer.isGuest && !customer.isVerified));
      if (usable) {
        req.customer = customer;
        req.isGuest = decoded.role === "guest";
      }
    }
  } catch {
    /* an expired or invalid token is treated as not signed in */
  }
  next();
};
