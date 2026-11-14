import mongoose from "mongoose";

// "Tell me when it is back": one row per product option per email.
const stockAlertSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null },
    notifiedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

stockAlertSchema.index({ product: 1, variantId: 1, email: 1 }, { unique: true });
stockAlertSchema.index({ product: 1, notifiedAt: 1 });
// Alerts that were already sent clean themselves up after 90 days
stockAlertSchema.index(
  { notifiedAt: 1 },
  { expireAfterSeconds: 90 * 24 * 3600, partialFilterExpression: { notifiedAt: { $type: "date" } } },
);

export default mongoose.model("StockAlert", stockAlertSchema);
