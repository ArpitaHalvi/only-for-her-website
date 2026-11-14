/**
 * customerAuth.controller.js
 *
 * Handles customer (storefront) authentication — completely separate from
 * the admin User/auth system.
 *
 * Auth flows:
 *   1. Email OTP  — POST /send-otp  → POST /verify-otp
 *   2. Google OAuth — GET /google   → GET /google/callback
 *
 * No password is stored. OTP is a 6-digit code valid for 10 minutes.
 * After verification a JWT with role:"customer" is issued.
 *
 * Email delivery uses nodemailer with the SMTP env vars.
 * If SMTP is not configured the OTP is logged to console (dev fallback).
 */

import jwt from "jsonwebtoken";
import crypto from "crypto";
import Customer from "../models/customer.model.js";
import { sendMail } from "../utils/mailer.js";
import { logoAttachments, logoHtml } from "../utils/emailBrand.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isProd = process.env.NODE_ENV === "production";
const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // one code per minute per email
const OTP_MAX_ATTEMPTS = 5; // wrong guesses allowed per code
const OTP_LOCK_MS = 15 * 60 * 1000; // lock-out after too many wrong guesses

/** Generate a 6-digit numeric OTP from a cryptographically secure source */
function generateOTP() {
  return String(crypto.randomInt(100000, 1000000));
}

/**
 * Hash OTP before storing so a DB leak doesn't expose codes. Keyed (HMAC) with
 * the server secret and bound to the email, so the 1,000,000 possible codes can
 * not be pre-computed from a leaked database.
 */
function hashOTP(otp, email) {
  return crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(`${email}:${otp}`)
    .digest("hex");
}

/** Constant-time comparison of two hex digests */
function sameHash(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Sign a JWT for a verified customer */
function signToken(customer) {
  return jwt.sign(
    { id: customer._id, role: "customer" },
    process.env.JWT_SECRET,
    { expiresIn: process.env.CUSTOMER_TOKEN_TTL || "14d", algorithm: "HS256" },
  );
}

const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v));
const PHONE_RE = /^[0-9]{10,15}$/;
const PINCODE_RE = /^[0-9]{6}$/;
const cleanPhone = (v) =>
  String(v)
    .trim()
    .slice(0, 30)
    .replace(/[\s\-().+]/g, "");
const MAX_ADDRESSES = 10;
const MAX_WISHLIST = 200;

/** Try to send email via nodemailer — falls back to console.log if not configured */

const BRAND = "Only For Her";
// Until a domain is verified in Resend, onboarding@resend.dev can only deliver
// to the Resend account owner. Set MAIL_FROM (e.g. "Only For Her <login@yourdomain.com>")
// once your domain is verified so customers receive their codes.
// const MAIL_FROM = () => process.env.MAIL_FROM || `${BRAND} <onboarding@resend.dev>`;

async function sendOTPEmail(toEmail, otp) {
  if (!process.env.RESEND_API_KEY) {
    // Printing codes is a development convenience only; in production it would
    // put working login codes in the logs.
    if (isProd) throw new Error("RESEND_API_KEY is not configured.");
    console.log(
      `\n📧 OTP for ${toEmail}: ${otp} (RESEND_API_KEY not configured)\n`,
    );
    return;
  }

  try {
    // While testing, MAIL_TEST_RECIPIENT sends every code to one inbox (an unverified Resend
    // domain can only deliver to the account owner). Leave it unset in production.
    await sendMail({
      to: process.env.MAIL_TEST_RECIPIENT || toEmail,
      subject: `Your login code — ${BRAND}`,
      attachments: logoAttachments(),
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:32px;border:1px solid #ece3d9;border-radius:12px;background:#ffffff;">
          ${logoHtml(BRAND)}

          <p style="color:#2b1a20;font-size:15px;line-height:1.6;margin:0;">
            Use the code below to sign in. It expires in <strong>10 minutes</strong>.
          </p>

          <div style="margin:24px 0;background:#f7f2ec;border-radius:10px;padding:20px;text-align:center;">
            <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#640f2b;">
              ${otp}
            </span>
          </div>

          <p style="color:#7d6b71;font-size:13px;line-height:1.5;margin:0;">
            If you didn't request this, you can safely ignore this email.
          </p>
        </div>
      `,
    });
  } catch (error) {
    console.error("❌ Failed to send OTP email:", error?.message);
    throw error;
  }
}

// async function sendOTPEmail(toEmail, otp) {
//   const SMTP_HOST = process.env.SMTP_HOST;
//   const SMTP_USER = process.env.SMTP_USER;
//   const SMTP_PASS = process.env.SMTP_PASS;
//   const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

//   if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
//     // Dev fallback — print to terminal
//     console.log(`\n📧  OTP for ${toEmail}: ${otp}  (SMTP not configured)\n`);
//     return;
//   }

//   // Dynamic import so the app doesn't crash if nodemailer isn't installed yet
//   const nodemailer = await import("nodemailer").catch(() => null);
//   if (!nodemailer) {
//     console.log(`\n📧  OTP for ${toEmail}: ${otp}  (nodemailer not installed)\n`);
//     return;
//   }

//   const transporter = nodemailer.default.createTransport({
//     host: SMTP_HOST,
//     port: Number(process.env.SMTP_PORT || 587),
//     secure: process.env.SMTP_SECURE === "true",
//     auth: { user: SMTP_USER, pass: SMTP_PASS },
//   });

//   await transporter.sendMail({
//     from: `"Toys & Kids Planet" <${SMTP_FROM}>`,
//     to: toEmail,
//     subject: "Your login OTP — Toys & Kids Planet",
//     html: `
//       <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;border:1px solid #e5e7eb;border-radius:12px;">
//         <h2 style="color:#1a2236;margin-bottom:8px;">🪀 Toys & Kids Planet</h2>
//         <p style="color:#3d4a5c;font-size:15px;">Use the OTP below to sign in. It expires in <strong>10 minutes</strong>.</p>
//         <div style="margin:24px 0;background:#f0fafa;border-radius:10px;padding:20px;text-align:center;">
//           <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#1a2236;">${otp}</span>
//         </div>
//         <p style="color:#707f94;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
//       </div>
//     `,
//   });
// }

// ─── Public safe customer shape ───────────────────────────────────────────────

function safeCustomer(c) {
  return {
    _id: c._id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    avatar: c.avatar,
    provider: c.provider,
    isVerified: c.isVerified,
    wishlist: c.wishlist,
    addresses: c.addresses,
    whatsappOptIn: c.whatsappOptIn === true,
    marketingOptIn: c.marketingOptIn === true,
    createdAt: c.createdAt,
  };
}

// ─── Email OTP ────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/customer/auth/send-otp
 * Body: { email }
 *
 * Creates or looks up the customer by email, generates an OTP, stores the
 * hashed version, then emails the plain OTP.
 */
export const sendEmailOTP = async (req, res) => {
  try {
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    if (!email || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "A valid email address is required.",
      });
    }

    const otp = generateOTP();
    const hashedOtp = hashOTP(otp, email);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    // Upsert — create customer on first login
    let customer = await Customer.findOne({ email });
    if (!customer) {
      customer = new Customer({ email, provider: "email_otp" });
    }
    if (customer.isActive === false) {
      return res.status(403).json({
        success: false,
        message: "This account has been blocked. Please contact us.",
      });
    }
    const now = Date.now();

    // After too many wrong guesses no new code is issued until the lock ends,
    // otherwise asking for a fresh code would hand out fresh guesses.
    if (customer.otpLockedUntil && customer.otpLockedUntil.getTime() > now) {
      return res.status(429).json({
        success: false,
        message: "Too many wrong attempts. Please try again in a few minutes.",
      });
    }

    // One email per minute per address (stops mail-bombing someone's inbox)
    if (
      customer.otpSentAt &&
      now - customer.otpSentAt.getTime() < OTP_RESEND_COOLDOWN_MS
    ) {
      return res.status(429).json({
        success: false,
        message:
          "A code was just sent. Please wait a minute before asking for another.",
      });
    }

    customer.otp = hashedOtp;
    customer.otpExpiresAt = expiresAt;
    customer.otpSentAt = new Date(now);
    // otpAttempts is NOT reset here: it only resets on a correct code or after a lock-out
    await customer.save();

    await sendOTPEmail(email, otp);

    return res.status(200).json({
      success: true,
      message: `OTP sent to ${email}. Valid for 10 minutes.`,
    });
  } catch (err) {
    console.error("sendEmailOTP error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

/**
 * POST /api/v1/customer/auth/verify-otp
 * Body: { email, otp }
 *
 * Verifies the OTP. On success clears otp fields, marks isVerified, returns JWT.
 */
export const verifyEmailOTP = async (req, res) => {
  try {
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const otp = typeof req.body.otp === "string" ? req.body.otp.trim() : "";

    if (!email || !/^[0-9]{6}$/.test(otp)) {
      return res
        .status(400)
        .json({ success: false, message: "Email and OTP are required." });
    }

    const customer = await Customer.findOne({ email });
    if (!customer || !customer.otp || !customer.otpExpiresAt) {
      return res.status(400).json({
        success: false,
        message: "No pending OTP for this email. Please request a new one.",
      });
    }

    if (
      customer.otpLockedUntil &&
      customer.otpLockedUntil.getTime() > Date.now()
    ) {
      return res.status(429).json({
        success: false,
        message: "Too many wrong attempts. Please try again in a few minutes.",
      });
    }

    if (new Date() > customer.otpExpiresAt) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
    }

    if (customer.isActive === false) {
      return res.status(403).json({
        success: false,
        message: "This account has been blocked. Please contact us.",
      });
    }

    if (!sameHash(customer.otp, hashOTP(otp, email))) {
      // A 6-digit code can be guessed, so only a few tries are allowed, and the
      // count survives requesting a new code
      customer.otpAttempts = (customer.otpAttempts || 0) + 1;
      if (customer.otpAttempts >= OTP_MAX_ATTEMPTS) {
        customer.otp = undefined;
        customer.otpExpiresAt = undefined;
        customer.otpAttempts = 0;
        customer.otpLockedUntil = new Date(Date.now() + OTP_LOCK_MS);
        await customer.save();
        return res.status(429).json({
          success: false,
          message:
            "Too many wrong attempts. Please try again in a few minutes.",
        });
      }
      await customer.save();
      return res
        .status(400)
        .json({ success: false, message: "Incorrect OTP. Please try again." });
    }

    // Clear OTP fields, mark verified and record the sign-in
    customer.otp = undefined;
    customer.otpExpiresAt = undefined;
    customer.otpAttempts = 0;
    customer.otpLockedUntil = undefined;
    customer.otpSentAt = undefined;
    customer.isVerified = true;
    customer.isGuest = false; // a guest who signs in keeps the orders placed as a guest
    customer.lastLoginAt = new Date();
    customer.lastLoginIp = req.ip;
    await customer.save();

    const token = signToken(customer);

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      customer: safeCustomer(customer),
    });
  } catch (err) {
    console.error("verifyEmailOTP error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// ─── Google OAuth ─────────────────────────────────────────────────────────────

/**
 * Called by passport-google-oauth20 strategy callback.
 * Looks up or creates the customer, returns JWT as a redirect.
 *
 * GET /api/v1/customer/auth/google/callback  (passport sets req.user)
 */
export const googleCallback = async (req, res) => {
  try {
    const profile = req.user; // set by passport strategy in customerPassport.js
    if (!profile) {
      return res.redirect(
        `${process.env.NEXT_FRONTEND_URL}/auth?error=google_failed`,
      );
    }

    if (profile.isActive === false) {
      return res.redirect(
        `${process.env.NEXT_FRONTEND_URL}/auth?error=blocked`,
      );
    }

    profile.lastLoginAt = new Date();
    profile.lastLoginIp = req.ip;
    await profile.save();

    const token = signToken(profile);

    // The token goes in the URL fragment (#), which browsers never send to a
    // server, so it stays out of access logs. The frontend stores it and clears the URL.
    return res.redirect(
      `${process.env.NEXT_FRONTEND_URL}/auth/callback#token=${token}`,
    );
  } catch (err) {
    console.error("googleCallback error:", err);
    return res.redirect(
      `${process.env.NEXT_FRONTEND_URL}/auth?error=server_error`,
    );
  }
};

// ─── Profile ──────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/customer/me
 * Returns the authenticated customer's profile.
 */
export const getMyProfile = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      data: safeCustomer(req.customer),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

/**
 * PATCH /api/v1/customer/me
 * Body: { name, phone }
 * Updates name and/or phone of the authenticated customer.
 */
export const updateMyProfile = async (req, res) => {
  try {
    const { name, phone, whatsappOptIn, marketingOptIn } = req.body;
    const customer = req.customer;

    for (const [key, value] of [
      ["whatsappOptIn", whatsappOptIn],
      ["marketingOptIn", marketingOptIn],
    ]) {
      if (value === undefined) continue;
      if (typeof value !== "boolean")
        return res
          .status(400)
          .json({ success: false, message: `${key} must be true or false.` });
      customer[key] = value;
    }

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length > 100) {
        return res
          .status(400)
          .json({ success: false, message: "Please enter a valid name." });
      }
      customer.name = name.trim();
    }
    if (phone !== undefined) {
      const p = typeof phone === "string" ? cleanPhone(phone) : null;
      if (p === null || (p && !PHONE_RE.test(p))) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid phone number (10 to 15 digits).",
        });
      }
      customer.phone = p || undefined;
    }

    await customer.save();

    return res.status(200).json({
      success: true,
      message: "Profile updated.",
      data: safeCustomer(customer),
    });
  } catch (err) {
    // A phone number already used by another customer (unique index)
    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "That phone number is already in use.",
      });
    }
    console.error("updateMyProfile error:", err.message);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

const ADDRESS_TYPES = ["home", "office", "someone_else", "other"];

/**
 * Cleans the address fields of a request body. Fields that are absent stay
 * undefined; a field that is present but invalid throws a message for the client.
 */
function readAddressFields(body) {
  const out = {};
  const text = (key, max, label, { required = false } = {}) => {
    const raw = body[key];
    if (raw === undefined) return;
    if (typeof raw !== "string") throw new Error(`Invalid ${label}.`);
    const v = raw.trim();
    if (required && !v) throw new Error(`Please enter the ${label}.`);
    if (v.length > max) throw new Error(`The ${label} is too long.`);
    out[key] = v;
  };
  text("label", 40, "label");
  text("relation", 60, "relation");
  text("fullName", 100, "name", { required: true });
  text("line1", 200, "address", { required: true });
  text("line2", 200, "address line 2");
  text("landmark", 120, "landmark");
  text("city", 80, "city", { required: true });
  text("state", 80, "state", { required: true });

  if (body.phone !== undefined) {
    const p = typeof body.phone === "string" ? cleanPhone(body.phone) : "";
    if (!PHONE_RE.test(p))
      throw new Error("Please enter a valid phone number (10 to 15 digits).");
    out.phone = p;
  }
  if (body.pincode !== undefined) {
    const p =
      typeof body.pincode === "string" || typeof body.pincode === "number"
        ? String(body.pincode).trim()
        : "";
    if (!PINCODE_RE.test(p))
      throw new Error("Please enter a valid 6-digit PIN code.");
    out.pincode = p;
  }
  if (ADDRESS_TYPES.includes(body.type)) out.type = body.type;
  return out;
}

// ─── Wishlist ─────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/customer/me/wishlist
 */
export const getWishlist = async (req, res) => {
  try {
    const customer = await req.customer.populate({
      path: "wishlist",
      select: "name slug price salePrice thumbnail gallery stock rating",
    });
    return res.status(200).json({ success: true, data: customer.wishlist });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

/**
 * POST /api/v1/customer/me/wishlist/:productId
 * Adds a product to wishlist (idempotent).
 */
export const addToWishlist = async (req, res) => {
  try {
    const { productId } = req.params;
    const customer = req.customer;

    if (!isObjectId(productId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product." });
    }

    const alreadyIn = customer.wishlist.some(
      (id) => id.toString() === productId,
    );
    if (!alreadyIn && customer.wishlist.length >= MAX_WISHLIST) {
      return res
        .status(400)
        .json({ success: false, message: "Your wishlist is full." });
    }
    if (!alreadyIn) {
      customer.wishlist.push(productId);
      await customer.save();
    }

    return res.status(200).json({
      success: true,
      message: alreadyIn ? "Already in wishlist." : "Added to wishlist.",
      wishlist: customer.wishlist,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

/**
 * DELETE /api/v1/customer/me/wishlist/:productId
 */
export const removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.params;
    const customer = req.customer;

    if (!isObjectId(productId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid product." });
    }

    customer.wishlist = customer.wishlist.filter(
      (id) => id.toString() !== productId,
    );
    await customer.save();

    return res.status(200).json({
      success: true,
      message: "Removed from wishlist.",
      wishlist: customer.wishlist,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

// ─── Addresses ────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/customer/me/addresses
 */
export const getAddresses = async (req, res) => {
  return res.status(200).json({ success: true, data: req.customer.addresses });
};

/**
 * POST /api/v1/customer/me/addresses
 * Body: { label, fullName, phone, line1, line2, city, state, pincode, isDefault }
 */
export const addAddress = async (req, res) => {
  try {
    const { fullName, phone, line1, city, state, pincode, isDefault } =
      req.body;

    if (!fullName || !phone || !line1 || !city || !state || !pincode) {
      return res.status(400).json({
        success: false,
        message:
          "fullName, phone, line1, city, state and pincode are required.",
      });
    }

    let fields;
    try {
      fields = readAddressFields(req.body);
    } catch (validation) {
      return res
        .status(400)
        .json({ success: false, message: validation.message });
    }

    const customer = req.customer;

    if (customer.addresses.length >= MAX_ADDRESSES) {
      return res.status(400).json({
        success: false,
        message: `You can save up to ${MAX_ADDRESSES} addresses.`,
      });
    }

    // If new address is default, clear existing default
    if (isDefault) {
      customer.addresses.forEach((a) => (a.isDefault = false));
    }

    customer.addresses.push({
      ...fields,
      type: fields.type || "home",
      label: fields.label || "Home",
      isDefault: !!isDefault,
    });

    await customer.save();

    return res.status(201).json({
      success: true,
      message: "Address added.",
      data: customer.addresses,
    });
  } catch (err) {
    console.error("addAddress error:", err.message);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

/**
 * PUT /api/v1/customer/me/addresses/:addressId
 */
export const updateAddress = async (req, res) => {
  try {
    const customer = req.customer;
    const addr = customer.addresses.id(req.params.addressId);

    if (!addr) {
      return res
        .status(404)
        .json({ success: false, message: "Address not found." });
    }

    let fields;
    try {
      fields = readAddressFields(req.body);
    } catch (validation) {
      return res
        .status(400)
        .json({ success: false, message: validation.message });
    }
    const { isDefault } = req.body;

    if (isDefault) customer.addresses.forEach((a) => (a.isDefault = false));

    Object.assign(addr, fields);
    if (isDefault !== undefined) addr.isDefault = !!isDefault;

    await customer.save();

    return res.status(200).json({
      success: true,
      message: "Address updated.",
      data: customer.addresses,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error." });
  }
};

/**
 * DELETE /api/v1/customer/me/addresses/:addressId
 */
export const deleteAddress = async (req, res) => {
  try {
    const customer = req.customer;
    const addr = customer.addresses.id(req.params.addressId);

    if (!addr) {
      return res
        .status(404)
        .json({ success: false, message: "Address not found." });
    }

    addr.deleteOne();
    await customer.save();

    return res.status(200).json({
      success: true,
      message: "Address deleted.",
      data: customer.addresses,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error." });
  }
};
