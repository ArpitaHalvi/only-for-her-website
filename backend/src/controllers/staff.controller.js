import User from "../models/user.model.js";
import { STAFF_ROLES } from "../middleware/permissions.js";

const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v));
const PUBLIC = "name email role isActive createdAt updatedAt";

/** GET /api/v1/staff — all back-office accounts (admin only) */
export const listStaff = async (_req, res) => {
  try {
    const staff = await User.find().select(PUBLIC).sort({ createdAt: 1 }).lean();
    res.status(200).json({ success: true, data: staff });
  } catch (err) {
    console.error("listStaff:", err.message);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/**
 * PATCH /api/v1/staff/:id — change a staff member's role or active state.
 * Body: { role?, isActive? }. Signs that person out everywhere.
 */
export const updateStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, isActive } = req.body;
    if (!isObjectId(id)) return res.status(400).json({ success: false, message: "Invalid id." });
    if (role !== undefined && !STAFF_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: `role must be one of: ${STAFF_ROLES.join(", ")}.` });
    }
    if (isActive !== undefined && typeof isActive !== "boolean") {
      return res.status(400).json({ success: false, message: "isActive must be true or false." });
    }

    const target = await User.findById(id);
    if (!target) return res.status(404).json({ success: false, message: "Staff member not found." });

    const losesAdmin =
      target.role === "admin" && ((role !== undefined && role !== "admin") || isActive === false);
    if (losesAdmin) {
      // Never leave the shop without a working admin (also stops self-lockout)
      const otherAdmins = await User.countDocuments({ _id: { $ne: target._id }, role: "admin", isActive: { $ne: false } });
      if (otherAdmins === 0) {
        return res.status(400).json({ success: false, message: "There must be at least one active admin." });
      }
    }

    if (role !== undefined) target.role = role;
    if (isActive !== undefined) target.isActive = isActive;
    target.tokenVersion = (target.tokenVersion || 0) + 1; // old sessions end
    await target.save();

    res.status(200).json({
      success: true,
      message: "Staff member updated.",
      data: { _id: target._id, name: target.name, email: target.email, role: target.role, isActive: target.isActive },
    });
  } catch (err) {
    console.error("updateStaff:", err.message);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};
