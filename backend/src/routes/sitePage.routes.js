import { Router } from "express";
import { requirePermission } from "../middleware/authMiddleware.js";
import { getPublicPage, listPublicPages, listAdminPages, savePage } from "../controllers/sitePage.controller.js";

// Mounted at /api/v1/site-pages (public)
export const publicPageRouter = Router();
publicPageRouter.get("/", listPublicPages);
publicPageRouter.get("/:key", getPublicPage);

// Mounted at /api/v1/admin/site-pages (staff with the "content" permission)
export const adminPageRouter = Router();
adminPageRouter.use(requirePermission("content"));
adminPageRouter.get("/", listAdminPages);
adminPageRouter.put("/:key", savePage);
