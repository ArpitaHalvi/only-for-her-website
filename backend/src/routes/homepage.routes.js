import { Router } from "express";
import upload from "../config/multer.js";
import { requirePermission } from "../middleware/authMiddleware.js";
import {
  getHomepage,
  listSections,
  createSection,
  updateSection,
  reorderSections,
  deleteSection,
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from "../controllers/homepage.controller.js";

// Mounted at /api/v1/home (public)
export const publicHomeRouter = Router();
publicHomeRouter.get("/", getHomepage);

// Mounted at /api/v1/admin/home (staff with the "content" permission)
export const adminHomeRouter = Router();
adminHomeRouter.use(requirePermission("content"));

const images = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "mobileImage", maxCount: 1 },
]);

adminHomeRouter.get("/sections", listSections);
adminHomeRouter.post("/sections", images, createSection);
adminHomeRouter.put("/sections/reorder", reorderSections); // before /:id
adminHomeRouter.put("/sections/:id", images, updateSection);
adminHomeRouter.delete("/sections/:id", deleteSection);

adminHomeRouter.get("/announcements", listAnnouncements);
adminHomeRouter.post("/announcements", createAnnouncement);
adminHomeRouter.put("/announcements/:id", updateAnnouncement);
adminHomeRouter.delete("/announcements/:id", deleteAnnouncement);
