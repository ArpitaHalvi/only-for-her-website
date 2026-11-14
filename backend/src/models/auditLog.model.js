import mongoose from "mongoose";

// Who changed what in the back office. Written automatically for every
// successful write (POST / PUT / PATCH / DELETE) made by a signed-in staff member.
const auditLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    email: { type: String },
    role: { type: String },
    method: { type: String, required: true },
    path: { type: String, required: true }, // without the query string
    entity: { type: String, index: true }, // e.g. "products", "admin/orders"
    entityId: { type: String },
    status: { type: Number },
    ip: { type: String },
    // Names of the fields that were sent. Values are never stored (they can hold passwords).
    fields: { type: [String], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

auditLogSchema.index({ createdAt: -1 });
// Keep a year of history
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 3600 });

export default mongoose.model("AuditLog", auditLogSchema);
