import AuditLog from "../models/auditLog.model.js";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ID = /^[0-9a-fA-F]{24}$/;

// Fields whose names say nothing useful and are never worth listing
const SKIP_FIELDS = new Set(["password", "currentPassword"]);

/**
 * Global middleware: after any successful write by a signed-in staff member
 * (req.user is only set by the staff guards), appends a row to the audit log.
 * Mount it once, before the routes. It never slows or fails a request: the
 * row is written after the response has gone out.
 */
export default function auditTrail(req, res, next) {
  if (!WRITE_METHODS.has(req.method)) return next();

  res.on("finish", () => {
    if (!req.user || res.statusCode >= 400) return;
    try {
      const path = req.originalUrl.split("?")[0];
      const parts = path.replace(/^\/api\/v1\//, "").split("/").filter(Boolean);
      const idPart = parts.find((p) => ID.test(p));
      const entity = parts.filter((p) => !ID.test(p)).slice(0, 2).join("/");

      const fields =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? Object.keys(req.body).filter((k) => !SKIP_FIELDS.has(k)).slice(0, 40)
          : [];

      AuditLog.create({
        user: req.user._id,
        email: req.user.email,
        role: req.user.role,
        method: req.method,
        path,
        entity,
        entityId: req.params?.id || req.params?.productId || idPart,
        status: res.statusCode,
        ip: req.ip,
        fields,
      }).catch((err) => console.error("audit log write failed:", err.message));
    } catch (err) {
      console.error("audit log failed:", err.message);
    }
  });
  next();
}
