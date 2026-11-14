import ContactUs from "../models/contactus.model.js";
import mongoose from "mongoose";

const isObjectId = (v) => /^[0-9a-fA-F]{24}$/.test(String(v));

// Fields an admin may change on a stored message (never ipAddress, createdBy, replies, ...)
const ADMIN_EDITABLE = ["type", "name", "email", "phone", "subject", "message", "status"];
const pickEditable = (body) => {
  const out = {};
  for (const key of ADMIN_EDITABLE) {
    if (typeof body?.[key] === "string") out[key] = body[key];
  }
  return out;
};

/* ============================================================
   📌 CREATE ContactUs (Public)
============================================================ */
export const createContactUs = async (req, res) => {
  try {
    const { type, name, email, phone, subject, message, meta, services } =
      req.body;

    // Only plain strings: objects here could carry query operators
    for (const value of [type, name, email, phone, subject, message]) {
      if (value !== undefined && value !== null && typeof value !== "string") {
        return res.status(400).json({ status: "error", message: "Invalid form data." });
      }
    }
    // "meta" holds free-form extra fields: keep it small
    if (meta !== undefined && (typeof meta !== "object" || meta === null || Array.isArray(meta) || JSON.stringify(meta).length > 4000)) {
      return res.status(400).json({ status: "error", message: "Invalid form data." });
    }
    if (services !== undefined && (!Array.isArray(services) || services.length > 20)) {
      return res.status(400).json({ status: "error", message: "Invalid form data." });
    }

    // Validate required fields
    if (!type) {
      return res.status(400).json({
        status: "error",
        message: "Form type is required.",
      });
    }

    if (!name || !phone) {
      return res.status(400).json({
        status: "error",
        message: "Name & Phone are required.",
      });
    }

    if (services && Array.isArray(services)) {
      const isInvalid = services.some(
        (id) => !mongoose.Types.ObjectId.isValid(id),
      );

      if (isInvalid) {
        console.log("Invalid service id..");

        return res.status(400).json({
          status: "error",
          message: "Invalid Service ID detected.",
        });
      }
    }

    // ---------------------------------------------
    // 🌟 CREATE DOCUMENT
    // ---------------------------------------------
    const contact = await ContactUs.create({
      type,
      name,
      email,
      phone: phone || null,
      subject: subject || null,
      message,
      meta: meta || {},
      services: services || null, // 👈 ADD THIS
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      createdBy: null, // public form: never trust a client-supplied user
    });

    return res.status(201).json({
      status: "success",
      message: "Form submitted successfully.",
      data: contact,
    });
  } catch (error) {
    // Schema problems (bad email or phone format, too-long text) are the
    // sender's mistake: answer 400 with the reasons instead of a 500.
    if (error.name === "ValidationError") {
      return res.status(400).json({
        status: "error",
        message: Object.values(error.errors)
          .map((e) => e.message)
          .join(" "),
      });
    }
    console.error("❌ Error creating contact:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Internal Server Error" });
  }
};

/* ============================================================
   📌 GET ALL ContactUs (Admin)
============================================================ */
export const getAllContactUs = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const total = await ContactUs.countDocuments();

    const messages = await ContactUs.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return res.status(200).json({
      status: "success",
      message: "Contact messages fetched successfully.",
      data: messages,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("❌ Error fetching contact list:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Internal Server Error" });
  }
};

/* ============================================================
   📌 GET ContactUs by ID
============================================================ */
export const getContactUsById = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid id." });
    }
    const contact = await ContactUs.findById(req.params.id).lean();

    if (!contact) {
      return res.status(404).json({
        status: "error",
        message: "Contact message not found.",
      });
    }

    return res.status(200).json({
      status: "success",
      data: contact,
    });
  } catch (error) {
    console.error("❌ Error fetching contact:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Internal Server Error" });
  }
};

/* ============================================================
   📌 PUT — Full Update
============================================================ */
export const updateContactUs = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid id." });
    }
    const data = pickEditable(req.body);

    const updated = await ContactUs.findByIdAndUpdate(
      req.params.id,
      { $set: data },
      { new: true, runValidators: true },
    );

    if (!updated) {
      return res
        .status(404)
        .json({ status: "error", message: "Contact not found." });
    }

    return res.status(200).json({
      status: "success",
      message: "Contact updated successfully.",
      data: updated,
    });
  } catch (error) {
    console.error("❌ Error updating contact:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Internal Server Error" });
  }
};

/* ============================================================
   📌 PATCH — Partial Update (status, read, etc.)
============================================================ */
export const partiallyUpdateContactUs = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid id." });
    }
    const data = pickEditable(req.body);

    const updated = await ContactUs.findByIdAndUpdate(
      req.params.id,
      { $set: data },
      { new: true, runValidators: true },
    );

    if (!updated) {
      return res
        .status(404)
        .json({ status: "error", message: "Contact not found." });
    }

    return res.status(200).json({
      status: "success",
      message: "Contact partially updated.",
      data: updated,
    });
  } catch (error) {
    console.error("❌ Error partial updating contact:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Internal Server Error" });
  }
};

/* ============================================================
   📌 ADMIN Respond to Contact Message
============================================================ */
export const respondToContactUs = async (req, res) => {
  try {
    const { message } = req.body;

    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid id." });
    }
    if (typeof message !== "string" || !message.trim() || message.length > 2000) {
      return res.status(400).json({
        status: "error",
        message: "Response message must be 1 to 2000 characters.",
      });
    }
    const contact = await ContactUs.findById(req.params.id);
    if (!contact) {
      return res
        .status(404)
        .json({ status: "error", message: "Contact not found." });
    }

    contact.response = {
      message,
      respondedBy: req.user._id,
      respondedAt: new Date(),
    };

    contact.replies.push({
      message,
      respondedBy: req.user._id,
    });

    contact.status = "answered";

    await contact.save();

    return res.status(200).json({
      status: "success",
      message: "Response added successfully.",
      data: contact,
    });
  } catch (error) {
    console.error("❌ Error responding contact:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Internal Server Error" });
  }
};

/* ============================================================
   📌 DELETE ContactUs by ID
============================================================ */
export const destroyContactUsById = async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid id." });
    }
    const deleted = await ContactUs.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({
        status: "error",
        message: "Contact message not found.",
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Contact message deleted successfully.",
      data: deleted,
    });
  } catch (error) {
    console.error("❌ Error deleting contact:", error);
    return res
      .status(500)
      .json({ status: "error", message: "Internal Server Error" });
  }
};
