import fs from "node:fs";

/**
 * Checks what a file really is from its first bytes ("magic numbers"), because
 * the file name and the Content-Type header are both chosen by the uploader.
 */

const startsWith = (buf, bytes, offset = 0) =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);

/** Returns "jpeg" | "png" | "gif" | "webp" | "pdf" | "mp4" | "xlsx" | "xls" | null */
export function detectFileType(buf) {
  if (!buf || buf.length < 12) return null;
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38])) return "gif"; // GIF8
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x41, 0x56, 0x49, 0x20], 8)) return "avi";
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46])) return "pdf"; // %PDF
  if (startsWith(buf, [0x66, 0x74, 0x79, 0x70], 4)) return "mp4"; // ....ftyp (mp4 / mov)
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) return "xlsx"; // zip container
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "xls";
  return null;
}

export const IMAGE_TYPES = ["jpeg", "png", "gif", "webp"];

export const isImageBuffer = (buf) => IMAGE_TYPES.includes(detectFileType(buf));
export const isSpreadsheetBuffer = (buf) => ["xlsx", "xls"].includes(detectFileType(buf));

/** Reads the first bytes of a file on disk and reports whether it is an allowed type. */
export async function isAllowedFileOnDisk(filePath, allowedTypes = IMAGE_TYPES) {
  let handle;
  try {
    handle = await fs.promises.open(filePath, "r");
    const buf = Buffer.alloc(16);
    await handle.read(buf, 0, 16, 0);
    return allowedTypes.includes(detectFileType(buf));
  } catch {
    return false;
  } finally {
    await handle?.close().catch(() => {});
  }
}

/** Deletes a temp file, ignoring errors. */
export const removeFile = (filePath) => fs.promises.unlink(filePath).catch(() => {});
