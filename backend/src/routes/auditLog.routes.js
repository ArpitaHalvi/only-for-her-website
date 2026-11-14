import { Router } from "express";
import AuditLog from "../models/auditLog.model.js";
import { ensureAuth } from "../middleware/authMiddleware.js";

const router = Router();
const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v));

// GET /api/v1/admin/audit-logs?user=&entity=&method=&page=&limit=  (admin only)
router.get("/", ensureAuth, async (req, res) => {
  try {
    const page = Math.min(Math.max(parseInt(req.query.page) || 1, 1), 10000);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);

    const query = {};
    if (req.query.user) {
      if (!isObjectId(req.query.user)) return res.status(400).json({ success: false, message: "Invalid user." });
      query.user = req.query.user;
    }
    if (req.query.entity) query.entity = String(req.query.entity).slice(0, 80);
    if (req.query.method) {
      const method = String(req.query.method).toUpperCase();
      if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return res.status(400).json({ success: false, message: "Invalid method." });
      query.method = method;
    }

    const [total, data] = await Promise.all([
      AuditLog.countDocuments(query),
      AuditLog.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ]);
    res.status(200).json({ success: true, data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error("audit logs:", err.message);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

export default router;
