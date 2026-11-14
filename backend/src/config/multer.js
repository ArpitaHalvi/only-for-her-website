import multer from "multer";
import path from "path";
import fs from "node:fs";
import crypto from "node:crypto";
import { detectFileType, removeFile } from "../utils/fileSignature.js";

// Temporary upload directory
const uploadDir = "uploads/temp";

// Ensure folder exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// What each allowed extension must really contain (checked from the file's bytes)
const EXTENSION_TYPES = {
  ".jpg": "jpeg",
  ".jpeg": "jpeg",
  ".png": "png",
  ".webp": "webp",
  ".gif": "gif",
  ".pdf": "pdf",
  ".mp4": "mp4",
  ".mov": "mp4",
  ".avi": "avi",
};

// Multer Storage (temporary, Cloudinary will store permanently)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    // Random name: the uploader's file name is never used on disk
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
    cb(null, uniqueName);
  },
});

// File Type Validation (images + videos + pdf): extension first, bytes after
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (EXTENSION_TYPES[ext]) {
    cb(null, true);
  } else {
    cb(new Error("Only image, video or PDF files are allowed."), false);
  }
};

const base = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // Max 10 MB per file
    files: 10,
    fields: 100,
  },
});

const collectFiles = (req) => {
  const files = [];
  if (req.file) files.push(req.file);
  if (Array.isArray(req.files)) files.push(...req.files);
  else if (req.files) Object.values(req.files).forEach((list) => files.push(...list));
  return files;
};

// Reads the first bytes of every saved file and rejects a file whose content
// does not match its extension (e.g. a script renamed to photo.jpg).
async function verifySignatures(req) {
  const files = collectFiles(req);
  for (const file of files) {
    const ext = path.extname(file.originalname).toLowerCase();
    let handle;
    let detected = null;
    try {
      handle = await fs.promises.open(file.path, "r");
      const buf = Buffer.alloc(16);
      await handle.read(buf, 0, 16, 0);
      detected = detectFileType(buf);
    } catch {
      detected = null;
    } finally {
      await handle?.close().catch(() => {});
    }

    if (detected !== EXTENSION_TYPES[ext]) {
      await Promise.all(files.map((f) => removeFile(f.path)));
      const err = new Error("One of the files is not a valid file of its type.");
      err.statusCode = 400;
      throw err;
    }
  }
}

// Same API as multer (single / fields / array), plus the content check
const guard = (middleware) => (req, res, next) =>
  middleware(req, res, (err) => {
    if (err) {
      // fileFilter errors are the uploader's mistake
      if (!err.statusCode && err.name !== "MulterError") err.statusCode = 400;
      return next(err);
    }
    verifySignatures(req).then(() => next(), next);
  });

const upload = {
  single: (name) => guard(base.single(name)),
  array: (name, max) => guard(base.array(name, max)),
  fields: (fields) => guard(base.fields(fields)),
};

export default upload;
