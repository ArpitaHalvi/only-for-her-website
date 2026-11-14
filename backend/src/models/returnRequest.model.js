import mongoose from "mongoose";
import { nextSequence } from "./counter.model.js";

export const RETURN_TYPES = ["return", "exchange"];

export const RETURN_REASONS = [
  "damaged", // arrived broken / damaged
  "wrong_item", // not what was ordered
  "not_as_described", // looks different from the photos / description
  "quality_issue", // plating faded, stone fell out, ...
  "size_issue", // does not fit / too big / too small
  "changed_mind",
  "other",
];

export const RETURN_STATUSES = [
  "requested", // customer asked, waiting for the shop
  "approved", // shop agreed: customer can send it back
  "pickup_scheduled", // courier pickup booked (or customer shipping it back)
  "received", // parcel is back at the shop and checked
  "refunded", // money returned
  "exchanged", // replacement sent
  "rejected", // shop declined
  "closed", // finished without refund / exchange
  "cancelled", // customer withdrew the request
];

const returnItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    name: { type: String, required: true },
    variantName: { type: String },
    sku: { type: String },
    image: { type: String },
    price: { type: Number, required: true, min: 0 }, // unit price the customer paid
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const historySchema = new mongoose.Schema(
  {
    status: { type: String, enum: RETURN_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    by: { type: String, default: "system" }, // "customer", "system" or the staff member's email
    note: { type: String, maxlength: 500 },
  },
  { _id: false },
);

const returnRequestSchema = new mongoose.Schema(
  {
    requestNo: { type: String, unique: true }, // RR-000001
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    orderNo: { type: String },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    customerEmail: { type: String },
    type: { type: String, enum: RETURN_TYPES, default: "return" },
    reason: { type: String, enum: RETURN_REASONS, required: true },
    comment: { type: String, trim: true, maxlength: 1000 },
    photos: {
      type: [{ url: { type: String, required: true }, publicId: { type: String, required: true }, _id: false }],
      default: [],
    },
    items: { type: [returnItemSchema], validate: [(v) => v.length > 0, "Choose at least one item."] },

    status: { type: String, enum: RETURN_STATUSES, default: "requested", index: true },
    statusHistory: { type: [historySchema], default: [] },

    // Bringing the goods back
    pickup: {
      courierName: { type: String, trim: true, maxlength: 80 },
      trackingNumber: { type: String, trim: true, maxlength: 80 },
      scheduledAt: { type: Date },
    },

    // Money back (return only)
    refundAmount: { type: Number, min: 0, default: 0 },
    refundMethod: { type: String, enum: ["original", "manual", null], default: null }, // original = back through Razorpay
    refundedAt: { type: Date },

    // Items go back on the shelf only if they are fit to sell
    restock: { type: Boolean, default: false },
    restocked: { type: Boolean, default: false },

    adminNote: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true, versionKey: false },
);

returnRequestSchema.index({ createdAt: -1 });

returnRequestSchema.pre("validate", async function (next) {
  try {
    if (this.isNew && !this.requestNo) {
      this.requestNo = `RR-${String(await nextSequence("return")).padStart(6, "0")}`;
    }
    if (this.isNew && !this.statusHistory.length) {
      this.statusHistory.push({ status: this.status, by: "customer", note: "Request placed" });
    }
    next();
  } catch (err) {
    next(err);
  }
});

export default mongoose.model("ReturnRequest", returnRequestSchema);
