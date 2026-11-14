import mongoose from "mongoose";

export const STOCK_REASONS = [
  "order", // taken by a placed order
  "order_release", // given back by a cancelled / failed order
  "return", // customer return received back into stock
  "manual", // admin changed the count
  "restock", // new goods received
  "damage", // written off
];

// An append-only ledger of every stock change, so a count can always be explained.
const stockMovementSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    name: { type: String },
    sku: { type: String },
    delta: { type: Number, required: true }, // + added to stock, - removed
    stockAfter: { type: Number }, // when known
    reason: { type: String, enum: STOCK_REASONS, required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    returnRequest: { type: mongoose.Schema.Types.ObjectId, ref: "ReturnRequest", default: null },
    by: { type: String, default: "system" }, // "system", "customer" or the staff member's email
    note: { type: String, maxlength: 300 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

stockMovementSchema.index({ createdAt: -1 });

export default mongoose.model("StockMovement", stockMovementSchema);
