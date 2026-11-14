import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Coupon code is required"],
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9_-]{3,30}$/, "Code must be 3 to 30 letters, numbers, - or _"],
    },
    description: { type: String, trim: true },

    // percent / fixed take money off; free_shipping removes the delivery charge
    type: { type: String, enum: ["percent", "fixed", "free_shipping"], required: true },
    value: {
      type: Number,
      default: 0,
      min: [0, "Discount cannot be negative"],
      validate: {
        validator(v) {
          return this.type !== "percent" || v <= 100;
        },
        message: "A percentage discount cannot be above 100.",
      },
    },
    // Only for percent coupons: the most it can take off
    maxDiscount: { type: Number, min: 0, default: null },
    minOrderAmount: { type: Number, min: 0, default: 0 },

    startsAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },

    usageLimit: { type: Number, min: 1, default: null }, // in total; null = unlimited
    usedCount: { type: Number, min: 0, default: 0 },
    perCustomerLimit: { type: Number, min: 1, default: null }, // null = unlimited

    // Only for a customer's very first order
    firstOrderOnly: { type: Boolean, default: false },
    // Empty lists = applies to everything. Otherwise the discount only counts
    // the matching items (a product or any category / sub-category listed).
    applicableProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    applicableCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: "ProductCategory" }],
    excludedProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

couponSchema.pre("validate", function (next) {
  if (this.type !== "free_shipping" && !(this.value > 0)) this.invalidate("value", "Discount value is required");
  if (this.startsAt && this.expiresAt && this.expiresAt < this.startsAt) this.invalidate("expiresAt", "End date must be after the start date.");
  next();
});

const Coupon = mongoose.model("Coupon", couponSchema);
export default Coupon;
