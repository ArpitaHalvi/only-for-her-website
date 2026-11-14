import mongoose from "mongoose";

/**
 * One delivery PIN code. Used by the PIN code check on product / cart pages and
 * by checkout. How it is read depends on App Configuration "serviceabilityMode":
 *   open    (default) every PIN code is delivered to, except those listed here as not serviceable
 *   listed  only the PIN codes listed here (and serviceable) are delivered to
 * `codAvailable: false` switches cash on delivery off for that PIN code.
 */
const serviceAreaSchema = new mongoose.Schema(
  {
    pincode: {
      type: String,
      required: [true, "PIN code is required"],
      unique: true,
      trim: true,
      match: [/^[1-9][0-9]{5}$/, "PIN code must be 6 digits."],
    },
    city: { type: String, trim: true, maxlength: 80 },
    state: { type: String, trim: true, maxlength: 80 },
    isServiceable: { type: Boolean, default: true },
    codAvailable: { type: Boolean, default: true },
    // Delivery time shown to the customer, in days
    minDays: { type: Number, min: 0, max: 60, default: null },
    maxDays: { type: Number, min: 0, max: 60, default: null },
    note: { type: String, trim: true, maxlength: 200 },
  },
  { timestamps: true, versionKey: false },
);

serviceAreaSchema.pre("validate", function (next) {
  if (this.minDays != null && this.maxDays != null && this.maxDays < this.minDays)
    this.invalidate("maxDays", "Maximum days cannot be less than minimum days.");
  next();
});

export default mongoose.model("ServiceArea", serviceAreaSchema);
