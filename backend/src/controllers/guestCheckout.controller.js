/**
 * Guest checkout.
 *
 * POST /api/v1/orders/guest/session   { name, email, phone? }
 *
 * A shopper without an account gives their details and gets back a short-lived
 * "guest" token. It works only for the checkout routes (price a cart, place an
 * order, pay / retry payment, view that order). The order is attached to a
 * lightweight, unverified customer record for that email, so:
 *   - nothing else about any account is reachable with the token;
 *   - when the shopper later signs in with an email code (or Google) for the
 *     same address, the record becomes a normal account that already holds
 *     their orders, and any guest token stops working;
 *   - an email that already belongs to a verified account is refused: the
 *     shopper has to sign in, so nobody can place orders on someone else's
 *     account just by typing their email.
 */
import jwt from "jsonwebtoken";
import Customer from "../models/customer.model.js";
import { isValidEmail } from "../utils/password.js";

export const GUEST_TOKEN_TTL = process.env.GUEST_TOKEN_TTL || "3h";
const PHONE_RE = /^\+?[0-9]{10,15}$/;

export const signGuestToken = (customer) =>
  jwt.sign({ id: customer._id, role: "guest" }, process.env.JWT_SECRET, { expiresIn: GUEST_TOKEN_TTL, algorithm: "HS256" });

export const createGuestSession = async (req, res) => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const phone = typeof req.body.phone === "string" ? req.body.phone.replace(/[\s\-()]/g, "") : "";

    if (!email || email.length > 254 || !isValidEmail(email))
      return res.status(400).json({ success: false, message: "A valid email address is required." });
    if (!name || name.length > 100) return res.status(400).json({ success: false, message: "Please enter your name." });
    if (phone && !PHONE_RE.test(phone)) return res.status(400).json({ success: false, message: "Please enter a valid phone number (10 to 15 digits)." });

    let customer = await Customer.findOne({ email });
    if (customer?.isActive === false)
      return res.status(403).json({ success: false, message: "This account has been blocked. Please contact us." });
    if (customer?.isVerified)
      return res.status(409).json({
        success: false,
        code: "ACCOUNT_EXISTS",
        message: "An account with this email already exists. Please sign in to continue.",
      });

    if (!customer) customer = new Customer({ email, provider: "email_otp" });
    customer.isGuest = true;
    customer.name = name;
    // A phone number can belong to one customer only; if it is taken the order keeps it on the address instead
    if (phone && !customer.phone && !(await Customer.exists({ phone, _id: { $ne: customer._id } }))) customer.phone = phone;
    await customer.save();

    return res.status(200).json({
      success: true,
      data: { token: signGuestToken(customer), expiresIn: GUEST_TOKEN_TTL, guest: true, name: customer.name, email: customer.email },
    });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ success: false, message: "Please try again." });
    console.error("createGuestSession error:", err.message);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};
