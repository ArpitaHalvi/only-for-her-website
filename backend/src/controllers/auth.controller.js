import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { BCRYPT_ROUNDS, isValidEmail, passwordProblem } from "../utils/password.js";
import { STAFF_ROLES } from "../middleware/permissions.js";

const ADMIN_TOKEN_TTL = process.env.ADMIN_TOKEN_TTL || "1d";

const signAdminToken = (user) =>
  jwt.sign(
    { id: user._id, email: user.email, role: user.role, tv: user.tokenVersion ?? 0 },
    process.env.JWT_SECRET,
    { expiresIn: ADMIN_TOKEN_TTL, algorithm: "HS256" },
  );

// A real bcrypt hash of a random string: compared against when the email is
// unknown, so a wrong email and a wrong password take the same time.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Register a new back-office user.
// Route guard: the very first account can be created with no token; after that
// only a signed-in admin can create more (see ensureAdminUnlessNoUsers).
export const register = async (req, res) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email =
      typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const { password } = req.body;

    // The first account on an empty database is the admin. After that the admin
    // chooses the role explicitly: it is never inferred and never defaults upward.
    let role = "admin";
    if (!req.bootstrap) {
      role = req.body.role;
      if (!STAFF_ROLES.includes(role)) {
        return res.status(400).json({ message: `role must be one of: ${STAFF_ROLES.join(", ")}.` });
      }
    }

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required." });
    }
    if (name.length > 100) {
      return res.status(400).json({ message: "Name is too long." });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Please enter a valid email address." });
    }
    const weak = passwordProblem(password);
    if (weak) {
      return res.status(400).json({ message: weak });
    }

    const existingUser = await User.findOne({
      email: new RegExp(`^${escapeRegex(email)}$`, "i"),
    });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    // Role is set here, never taken from the request body
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      provider: "local",
      role,
    });

    res.status(201).json({
      message: "User registered successfully.",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Email already registered" });
    }
    console.error("Register error:", error.message);
    res.status(500).json({ message: "Internal Server Error." });
  }
};

// Login User via email & password

export const login = async (req, res) => {
  try {
    const rawEmail = req.body?.email;
    const password = req.body?.password;

    // Strings only: an object here could become a query operator
    if (typeof rawEmail !== "string" || typeof password !== "string") {
      return res.status(400).json({
        status: "error",
        message: "Email and password are required.",
        field: typeof rawEmail !== "string" ? "email" : "password",
      });
    }

    // Normalize email (avoid case sensitivity issues)
    const email = rawEmail.trim().toLowerCase();

    if (!email || !password || password.length > 128) {
      return res.status(400).json({
        status: "error",
        message: "Email and password are required.",
        field: !email ? "email" : "password",
      });
    }

    // Case-insensitive so accounts saved before emails were lowercased still work
    const user = await User.findOne({
      email: new RegExp(`^${escapeRegex(email)}$`, "i"),
    });

    // Compare even when the user is unknown, to keep timing the same
    const isMatch = await bcrypt.compare(password, user?.password || DUMMY_HASH);

    // Generic error (avoid telling which field is incorrect for security)
    if (!user || !isMatch) {
      return res.status(401).json({
        status: "error",
        message: "Invalid email or password.",
      });
    }

    if (!STAFF_ROLES.includes(user.role) || user.isActive === false) {
      return res.status(403).json({
        status: "error",
        message: "This account does not have access.",
      });
    }

    const token = signAdminToken(user);

    return res.status(200).json({
      status: "success",
      message: "Login successful.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Something went wrong. Please try again later.",
    });
  }
};

// -------------------------
// Logout user (JWT)
// Bumping tokenVersion invalidates every token issued to this user so far.
// -------------------------
export const logout = async (req, res) => {
  try {
    await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
    return res.status(200).json({
      message: "Logout successful. Please remove the token from client storage.",
    });
  } catch (error) {
    console.error("Logout error:", error.message);
    return res.status(500).json({ message: "Internal Server Error." });
  }
};
