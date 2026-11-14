import mongoose from "mongoose";

import { STAFF_ROLES } from "../middleware/permissions.js";

export const USER_ROLES = STAFF_ROLES; // admin, manager, order_manager, content_manager, support

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    // Every account in this collection is a back-office user. The role is stored
    // explicitly (and checked by the auth middleware) so that a future non-admin
    // staff role can be added without every existing account silently gaining it.
    // Accounts created before this field existed read as "admin", as they did before.
    role: {
      type: String,
      enum: USER_ROLES,
      default: "admin",
    },
    // Deactivated staff can not sign in or use an existing token
    isActive: { type: Boolean, default: true },
    // Bumped on logout / password change: tokens issued before that stop working.
    tokenVersion: {
      type: Number,
      default: 0,
    },
    avatar: {
      type: String,
      required: false,
    },
    provider: {
      type: String,
      default: "credentials",
    },
    googleId: {
      type: String,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const User = mongoose.model("User", userSchema);

export default User;
