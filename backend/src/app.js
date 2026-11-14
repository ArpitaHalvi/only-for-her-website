// src/app.js

// Must be the first import — loads .env into process.env before any local
// module (e.g. customerPassport.js) reads from it during initialization.
// import "dotenv/config";
import dotenv from "dotenv";

import express from "express";
import passport from "passport";
import morgan from "morgan";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import rateLimit from "express-rate-limit";
import hpp from "hpp";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
// 🧩 Local Imports
import "./config/customerPassport.js"; // Customer Google OAuth (separate strategy)
// import connectDB from "./config/db.js";
import errorHandler from "./middleware/errorHandler.js";
import sanitizeInput from "./middleware/sanitize.js";
import auditTrail from "./middleware/auditTrail.js";

// 🗂 Routes
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import appConfigRoutes from "./routes/appConfig.routes.js";
import categoriesRoutes from "./routes/category.routes.js";
import blogRoutes from "./routes/blog.routes.js";
import courseRoutes from "./routes/course.routes.js";
import commentRoutes from "./routes/comment.routes.js";
import galleryRoutes from "./routes/gallery.routes.js";
import certificateRoutes from "./routes/certificate.routes.js";
import certificateDownloadRoutes from "./routes/userCertificate.routes.js";
import testimonialRoutes from "./routes/testimonials.routes.js";
import serviceRoutes from "./routes/service.routes.js";
import domainsRoutes from "./routes/domain.routes.js";
import policyRoutes from "./routes/policy.routes.js";
import contatUsRoutes from "./routes/contactus.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import productCategoryRoutes from "./routes/productCategory.routes.js";
import productRoutes from "./routes/product.routes.js";
import productAttributeRoutes from "./routes/productAttribute.routes.js";
import bulkUploadRoutes from "./routes/bulkUpload.routes.js";
import customerRoutes from "./routes/customerAuth.routes.js";
import orderRoutes from "./routes/order.routes.js";
import cartRoutes from "./routes/cart.routes.js";
import couponRoutes from "./routes/coupon.routes.js";
import offerRoutes from "./routes/offer.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import shippingRoutes from "./routes/shipping.routes.js";
import adminOrderRoutes from "./routes/adminOrder.routes.js";
import reviewRoutes from "./routes/review.routes.js";
import collectionRoutes from "./routes/collection.routes.js";
import staffRoutes from "./routes/staff.routes.js";
import auditLogRoutes from "./routes/auditLog.routes.js";
import { publicHomeRouter, adminHomeRouter } from "./routes/homepage.routes.js";
import { publicPageRouter, adminPageRouter } from "./routes/sitePage.routes.js";
import { publicServiceRouter, adminServiceRouter } from "./routes/serviceArea.routes.js";
import customerAdminRoutes from "./routes/customerAdmin.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import { adminInventoryRouter, stockAlertRouter } from "./routes/inventory.routes.js";
import { customerReturnRouter, adminReturnRouter } from "./routes/return.routes.js";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routePrefix = "/api/v1";
const isProd = process.env.NODE_ENV === "production";

// Exact-match allow-list. Extra origins can be added with CORS_EXTRA_ORIGINS
// (comma separated). Localhost is only allowed outside production.
const normalizeOrigin = (o) => (o || "").trim().replace(/\/+$/, "");
const allowedOrigins = new Set(
  [
    process.env.NEXT_FRONTEND_URL, // Storefront
    process.env.ADMIN_FRONTEND_URL, // Admin console
    ...(process.env.CORS_EXTRA_ORIGINS || "").split(","),
    ...(isProd
      ? []
      : ["http://localhost:3000", "http://localhost:5173", "http://localhost:5174"]),
  ]
    .map(normalizeOrigin)
    .filter(Boolean),
);

// Staging hosts on sslip.io: the host must END with the staging IP's domain.
// (A substring test would also match https://evil.com/?3.108.8.159.sslip.io)
const STAGING_HOST = /^(?:[a-z0-9-]+\.)*3\.108\.8\.159\.sslip\.io$/i;
function isStagingOrigin(origin) {
  try {
    const { protocol, hostname } = new URL(origin);
    return (protocol === "http:" || protocol === "https:") && STAGING_HOST.test(hostname);
  } catch {
    return false;
  }
}

// Behind nginx / a load balancer: trust the first proxy hop so req.ip (rate
// limiting, login records) is the visitor's address and not the proxy's.
// Override with TRUST_PROXY (a hop count such as "2", or "false").
const trustProxy = process.env.TRUST_PROXY ?? (isProd ? "1" : "false");
app.set(
  "trust proxy",
  /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy === "false" ? false : trustProxy,
);
app.disable("x-powered-by");

// ===============================================
// ⚡ Rate Limiting (before body parsing, so floods are rejected cheaply).
// Stricter per-route limits live in middleware/rateLimiters.js.
// ===============================================
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: Number(process.env.RATE_LIMIT_MAX) || 1000, // requests per IP per window; a storefront page load makes several
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests from this IP, please try again later." },
});
app.use(limiter);

// ===============================================
// 🧱 Core Middleware
// ===============================================
app.use(
  express.json({
    limit: "2mb",
    // The Razorpay webhook signature is computed over the exact raw bytes
    verify: (req, _res, buf) => {
      if (req.originalUrl.includes("/orders/razorpay-webhook"))
        req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use(
  cors({
    origin: function (origin, callback) {
      // No Origin header: server-to-server calls, curl, mobile apps, same-origin
      if (!origin) return callback(null, true);

      if (allowedOrigins.has(normalizeOrigin(origin)) || isStagingOrigin(origin)) {
        return callback(null, true);
      }

      // Not allowed: send no CORS headers (the browser blocks it). Not an error.
      return callback(null, false);
    },
    credentials: true,
    // So the browser can read the file name of an invoice download
    exposedHeaders: ["Content-Disposition"],
  }),
);

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(compression());
app.use(morgan(isProd ? "combined" : "dev"));
app.use(hpp()); // Prevent HTTP parameter pollution
app.use(sanitizeInput); // Strip "$operator" keys from bodies / params (NoSQL injection)

// ===============================================
// 🔐 Passport (Google OAuth for customers uses session:false; no server session)
// ===============================================
app.use(passport.initialize());

// ===============================================
// 🗂️ Static Files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ===============================================
// 🚏 API Routes
// ===============================================
app.use(auditTrail); // records who changed what (successful staff writes only)
app.use(`${routePrefix}/auth`, authRoutes);
app.use(`${routePrefix}/users`, userRoutes);
app.use(`${routePrefix}/app-config`, appConfigRoutes);
app.use(`${routePrefix}/categories`, categoriesRoutes);
app.use(`${routePrefix}/blog`, blogRoutes);
app.use(`${routePrefix}/course`, courseRoutes);
app.use(`${routePrefix}/comments`, commentRoutes);
app.use(`${routePrefix}/gallery`, galleryRoutes);
app.use(`${routePrefix}/certificate/download`, certificateDownloadRoutes);
app.use(`${routePrefix}/certificate`, certificateRoutes);
app.use(`${routePrefix}/testimonial`, testimonialRoutes);
app.use(`${routePrefix}/service`, serviceRoutes);
app.use(`${routePrefix}/domains`, domainsRoutes);
app.use(`${routePrefix}/policy`, policyRoutes);
app.use(`${routePrefix}/contact`, contatUsRoutes);
app.use(`${routePrefix}/upload`, uploadRoutes);
app.use(`${routePrefix}/product-categories`, productCategoryRoutes);
app.use(`${routePrefix}/products`, productRoutes);
app.use(`${routePrefix}/product-attributes`, productAttributeRoutes);
app.use(`${routePrefix}/bulk-upload`, bulkUploadRoutes);
app.use(`${routePrefix}/customer`, customerRoutes);
app.use(`${routePrefix}/orders`, orderRoutes);
app.use(`${routePrefix}/cart`, cartRoutes);
app.use(`${routePrefix}/coupons`, couponRoutes);
app.use(`${routePrefix}/offers`, offerRoutes);
app.use(`${routePrefix}/chat`, chatRoutes);
app.use(`${routePrefix}/shipping`, shippingRoutes);
app.use(`${routePrefix}/admin/orders`, adminOrderRoutes);
app.use(`${routePrefix}/reviews`, reviewRoutes);
app.use(`${routePrefix}/collections`, collectionRoutes);
app.use(`${routePrefix}/staff`, staffRoutes);
app.use(`${routePrefix}/stock-alerts`, stockAlertRouter);
app.use(`${routePrefix}/returns`, customerReturnRouter);
app.use(`${routePrefix}/admin/inventory`, adminInventoryRouter);
app.use(`${routePrefix}/admin/returns`, adminReturnRouter);
app.use(`${routePrefix}/admin/audit-logs`, auditLogRoutes);
app.use(`${routePrefix}/home`, publicHomeRouter);
app.use(`${routePrefix}/admin/home`, adminHomeRouter);
app.use(`${routePrefix}/site-pages`, publicPageRouter);
app.use(`${routePrefix}/admin/site-pages`, adminPageRouter);
app.use(`${routePrefix}/admin/customers`, customerAdminRoutes);
app.use(`${routePrefix}/serviceability`, publicServiceRouter);
app.use(`${routePrefix}/admin/serviceability`, adminServiceRouter);
app.use(`${routePrefix}/admin`, analyticsRoutes);

// ===============================================
// 🩵 Health Check
// ===============================================
app.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "🚀 API is running successfully!",
    version: "v1.0.0",
    env: process.env.NODE_ENV,
  });
});

// ===============================================
// 🧰 Global Error Handler
// ===============================================
app.use(errorHandler);

export default app;
