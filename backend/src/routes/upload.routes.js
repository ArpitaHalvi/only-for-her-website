// Backend/src/routes/upload.routes.js

import express from "express";
import {
  uploadToCloudinary,
  destroyFromCloudinary,
} from "../utils/cloudinaryService.js";
import { ensureAuth } from "../middleware/authMiddleware.js";
import { uploadLimiter } from "../middleware/rateLimiters.js";
import upload from "../config/multer.js";
import { isAllowedFileOnDisk, removeFile } from "../utils/fileSignature.js";

const router = express.Router();

// Only these Cloudinary folders can be deleted through the API, so an admin
// session can not wipe unrelated assets in the account.
const DELETABLE_PREFIXES = [
  "editor-images/",
  "users/avatar/",
  "only-for-her/",
  "rudrakshawala/", // pictures uploaded before the rename
  process.env.CLOUDINARY_FOLDER ? `${process.env.CLOUDINARY_FOLDER}/` : null,
].filter(Boolean);

const PUBLIC_ID = /^[A-Za-z0-9_\-./]{1,255}$/;

// ✅ Upload Image: images only (JPG, PNG, GIF, WebP), checked by content
router.post(
  "/image",
  uploadLimiter,
  ensureAuth,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image file provided." });
      }

      // The shared uploader also accepts PDF / video for other routes; this one is images only
      if (!(await isAllowedFileOnDisk(req.file.path))) {
        await removeFile(req.file.path);
        return res
          .status(400)
          .json({ message: "Only JPG, PNG, GIF or WebP images are allowed." });
      }

      const result = await uploadToCloudinary(req.file.path, "editor-images");

      res.status(200).json({
        message: "Image uploaded successfully!",
        url: result.secure_url,
        public_id: result.public_id, // 👈 store this in your editor or database
      });
    } catch (error) {
      console.error("Upload error:", error.message);
      res.status(500).json({ message: "Image upload failed." });
    }
  },
);

// ✅ Delete Image from Cloudinary (only from the folders this app uploads to)
router.delete("/image", uploadLimiter, ensureAuth, async (req, res) => {
  try {
    const { public_id } = req.body;

    if (!public_id || typeof public_id !== "string") {
      return res.status(400).json({ message: "public_id is required" });
    }

    if (
      !PUBLIC_ID.test(public_id) ||
      public_id.includes("..") ||
      !DELETABLE_PREFIXES.some((prefix) => public_id.startsWith(prefix))
    ) {
      return res.status(400).json({ message: "That public_id can not be deleted here." });
    }

    const result = await destroyFromCloudinary(public_id);
    res.status(200).json({
      message: "Image deleted successfully!",
      result,
    });
  } catch (error) {
    console.error("Cloudinary delete error:", error.message);
    res.status(500).json({ message: "Image delete failed." });
  }
});

export default router;
