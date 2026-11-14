import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { can, STAFF_ROLES } from "./permissions.js";

/**
 * Verifies a staff token and loads the user. Returns { user } or { status, message }.
 *
 * - Only tokens issued to a User are accepted: a customer token (role:"customer")
 *   is rejected even though it is signed with the same secret.
 * - The token's version must match the user's, so logging out, changing the
 *   password or changing the role revokes every token issued before.
 * - Deactivated accounts are rejected.
 */
async function authenticateStaff(req) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { status: 401, message: "Not Authorized, token missing." };
  }

  let decoded;
  try {
    decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
  } catch {
    return { status: 401, message: "Invalid or Expired token." };
  }

  // Customer and guest-checkout tokens are signed with the same secret: never staff.
  // (Staff tokens issued before roles existed carry no role and count as admin.)
  if (decoded.role !== undefined && !STAFF_ROLES.includes(decoded.role)) {
    return { status: 403, message: "Staff access required." };
  }

  const user = await User.findById(decoded.id).select("-password");
  if (!user) return { status: 401, message: "User not found." };

  // Tokens issued before tokenVersion existed carry no "tv" and count as 0
  if ((decoded.tv ?? 0) !== (user.tokenVersion ?? 0)) {
    return { status: 401, message: "Session expired. Please log in again." };
  }
  if (user.isActive === false) {
    return { status: 403, message: "This account has been deactivated." };
  }
  return { user };
}

/** Admin-only guard (the original guard: every route using it needs the admin role). */
export const ensureAuth = async (req, res, next) => {
  try {
    const result = await authenticateStaff(req);
    if (!result.user) return res.status(result.status).json({ message: result.message });
    if (result.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required." });
    }
    req.user = result.user;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid or Expired token." });
  }
};

// Clearer name for new code; same guard.
export const ensureAdmin = ensureAuth;

/** Guard for routes other staff roles may use too: needs the named permission. */
export const requirePermission = (permission) => async (req, res, next) => {
  try {
    const result = await authenticateStaff(req);
    if (!result.user) return res.status(result.status).json({ message: result.message });
    if (!can(result.user.role, permission)) {
      return res.status(403).json({ message: "You do not have permission to do this." });
    }
    req.user = result.user;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid or Expired token." });
  }
};

/**
 * Lets the very first account be created with no token (bootstrapping an empty
 * database). Once any user exists, creating another one needs an admin token.
 */
export const ensureAdminUnlessNoUsers = async (req, res, next) => {
  try {
    if (!(await User.exists({}))) {
      req.bootstrap = true;
      return next();
    }
    return ensureAuth(req, res, next);
  } catch (error) {
    return res.status(500).json({ message: "Internal Server Error." });
  }
};
