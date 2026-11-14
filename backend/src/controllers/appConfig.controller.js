import appConfig from "../models/appConfig.model.js";

// Only fields the schema defines can be written (no _id, timestamps or unknown keys)
const EDITABLE_FIELDS = Object.keys(appConfig.schema.paths).filter(
  (key) => !key.includes(".") && !["_id", "__v", "createdAt", "updatedAt"].includes(key),
);
const pickEditable = (body) => {
  const out = {};
  for (const key of EDITABLE_FIELDS) {
    if (body?.[key] !== undefined) out[key] = body[key];
  }
  return out;
};

/**
 * 🔓 Get latest App Config (Public)
 */
export const getPublicAppConfig = async (req, res) => {
  try {
    const latestConfig = await appConfig
      .findOne()
      .sort({ createdAt: -1 })
      .lean();

    if (!latestConfig) {
      return res.status(404).json({ message: "App Config not found." });
    }

    return res.status(200).json({
      success: true,
      message: "Public App Config fetched successfully.",
      data: latestConfig,
    });
  } catch (error) {
    console.error("❌ Error fetching public app config:", error);
    return res
      .status(500)
      .json({ message: "Internal Server Error" });
  }
};

/**
 * 🔓 Get latest App Config (Protected)
 */

// Get
export const getAppConfig = async (req, res) => {
  try {
    const app_config_data = await appConfig.findOne();

    if (!app_config_data) {
      return res.status(404).json({
        message: "App Config Data not found...",
      });
    }
    return res.status(200).json({
      message: "App Config Fetched...",
      app_config_data,
    });
  } catch (error) {
    console.error("❌ Error fetching app config:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const modifyAppConfig = async (req, res) => {
  try {
    // Only known settings are accepted; anything else in the body is ignored
    const updateData = pickEditable(req.body);

    // Validate required fields
    if (!updateData.appName || !updateData.email || !updateData.phoneNumber) {
      return res
        .status(400)
        .json({ message: "App Name, Email & Phone Number are required" });
    }

    // Check existing config
    let app = await appConfig.findOne();

    if (!app) {
      // Create New Config
      app = await appConfig.create(updateData);
    } else {
      // Update Existing
      app = await appConfig.findByIdAndUpdate(app._id, updateData, {
        new: true,
        runValidators: true,
      });
    }

    return res.status(201).json({
      message: "App Config Updated Successfully",
      data: app,
    });
  } catch (error) {
    // Bad values (wrong GSTIN format, negative charges, ...) are the sender's mistake
    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({
        message: Object.values(error.errors || {})
          .map((e) => e.message)
          .join(" ") || "Invalid settings.",
      });
    }
    console.error("❌ Modify App Config Error:", error.message);
    return res.status(500).json({
      message: "Internal Server Error - App Config Controller",
    });
  }
};
