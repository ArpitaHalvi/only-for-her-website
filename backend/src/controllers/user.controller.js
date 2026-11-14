import bcrypt from "bcryptjs";
import User from "../models/user.model.js";
import {
  destroyFromCloudinary,
  uploadToCloudinary,
} from "../utils/cloudinaryService.js";
import { BCRYPT_ROUNDS, isValidEmail, passwordProblem } from "../utils/password.js";
import { isAllowedFileOnDisk, removeFile } from "../utils/fileSignature.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Get Logged-in User's to these Profile
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("-password -tokenVersion")
      .lean();
    res.status(200).json({ message: "Profile fetch successfully", user });
  } catch (error) {
    console.error("Error feching profile: ", error.message);

    return res.status(500).json({ message: "Error feching profile." });
  }
};

// ✅ Update Logged-in User's Profile
export const updateProfileById = async (req, res) => {
  const avatarFile = req.files?.avatar?.[0];
  try {
    // ✅ Use ID from token (set by ensureAuth middleware)
    const userId = req.user?.id;
    const { name, email, password, currentPassword } = req.body || {};

    if (!userId) {
      return res
        .status(401)
        .json({ message: "Unauthorized. Please login again." });
    }

    for (const [field, value] of Object.entries({ name, email, password, currentPassword })) {
      if (value !== undefined && typeof value !== "string") {
        return res.status(400).json({ message: `Invalid ${field}.` });
      }
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    let updatedFields = {};
    const newEmail = email?.trim().toLowerCase();
    const emailChanging = !!newEmail && newEmail !== user.email;
    const passwordChanging = !!password?.trim();

    // Changing the sign-in details needs the current password, so a stolen
    // token alone can not take over the account.
    if (emailChanging || passwordChanging) {
      if (!currentPassword || !(await bcrypt.compare(currentPassword, user.password))) {
        return res
          .status(400)
          .json({ message: "Current password is incorrect." });
      }
    }

    if (emailChanging) {
      if (!isValidEmail(newEmail)) {
        return res.status(400).json({ message: "Please enter a valid email address." });
      }
      const taken = await User.exists({
        _id: { $ne: user._id },
        email: new RegExp(`^${escapeRegex(newEmail)}$`, "i"),
      });
      if (taken) {
        return res.status(400).json({ message: "Email already registered" });
      }
      updatedFields.email = newEmail;
    }

    if (passwordChanging) {
      const weak = passwordProblem(password);
      if (weak) return res.status(400).json({ message: weak });
      updatedFields.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
    }

    if (name !== undefined && name.trim() && name.trim() !== user.name) {
      if (name.trim().length > 100) {
        return res.status(400).json({ message: "Name is too long." });
      }
      updatedFields.name = name.trim();
    }

    // ✅ Handle avatar upload (form-data): the file must really be an image
    if (avatarFile?.path) {
      if (!(await isAllowedFileOnDisk(avatarFile.path))) {
        await removeFile(avatarFile.path);
        return res.status(400).json({ message: "The avatar must be a JPG, PNG, GIF or WebP image." });
      }
      try {
        const upload = await uploadToCloudinary(avatarFile.path, "users/avatar");

        // Delete old avatar if exists
        if (user.avatar) {
          const oldPublicId = user.avatar.split("/").pop().split(".")[0];
          await destroyFromCloudinary(`users/avatar/${oldPublicId}`);
        }

        updatedFields.avatar = upload.secure_url;
      } catch (err) {
        console.warn("⚠️ Avatar upload failed:", err.message);
      }
    }

    // ✅ If nothing changed
    if (Object.keys(updatedFields).length === 0) {
      return res.status(400).json({ message: "No changes detected." });
    }

    // A new password or email signs out every other session
    const update = { $set: updatedFields };
    if (passwordChanging || emailChanging) update.$inc = { tokenVersion: 1 };

    // ✅ Update user
    const updatedUser = await User.findByIdAndUpdate(userId, update, {
      new: true,
      runValidators: true,
      select: "-password -tokenVersion",
    });

    return res.status(200).json({
      message: "✅ User profile updated successfully.",
      data: updatedUser,
      // The old token stops working after a password / email change
      reloginRequired: passwordChanging || emailChanging,
    });
  } catch (error) {
    console.error("❌ Error updating user profile:", error.message);
    return res.status(500).json({
      message: "Internal Server Error while updating profile.",
    });
  } finally {
    // Never leave an uploaded temp file behind (uploadToCloudinary removes it on success)
    if (avatarFile?.path) await removeFile(avatarFile.path);
  }
};
