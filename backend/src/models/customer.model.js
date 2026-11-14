import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    // Who the address is for: your own home or office, another person, or something else
    type: { type: String, enum: ["home", "office", "someone_else", "other"], default: "home" },
    // Text shown for the address ("Home", "Office", "Gift for Asha", or what you typed for "other")
    label: { type: String, default: "Home" },
    // For "someone_else": how they are related to you, e.g. "Mother"
    relation: { type: String, trim: true },
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    line1: { type: String, required: true },
    line2: { type: String },
    landmark: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    country: { type: String, default: "India" },
    pincode: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true, // allows null + unique
      unique: true,
    },
    phone: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
    },
    avatar: { type: String },
    provider: {
      type: String,
      enum: ["google", "email_otp", "phone_otp"],
      required: true,
    },
    googleId: { type: String, sparse: true, unique: true },
    // OTP fields (cleared after verification)
    otp: { type: String },
    otpExpiresAt: { type: Date },
    isVerified: { type: Boolean, default: false },
    // Wishlist — array of product ObjectIds
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    // Saved addresses
    addresses: [addressSchema],

    // Blocked customers cannot sign in or order
    isActive: { type: Boolean, default: true },
    marketingOptIn: { type: Boolean, default: false },
    // Agreed to order updates / offers on WhatsApp (needed before any WhatsApp message is sent)
    whatsappOptIn: { type: Boolean, default: false },
    // Bought without an account and has not verified the email yet (see guestCheckout.controller.js)
    isGuest: { type: Boolean, default: false },
    // Newest first, at most 20
    recentlyViewed: {
      type: [{ product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" }, at: { type: Date, default: Date.now }, _id: false }],
      default: [],
    },
    lastLoginAt: { type: Date },
    lastLoginIp: { type: String },
    // Failed OTP guesses for the current code (reset when a new code is sent)
    otpAttempts: { type: Number, default: 0 },
    // When the last code was sent (resend cooldown) and, after too many wrong
    // guesses, until when no code can be requested or checked
    otpSentAt: { type: Date },
    otpLockedUntil: { type: Date },
    // Private notes for the shop
    notes: { type: String },
  },
  { timestamps: true, versionKey: false }
);

// Only one saved address can be the default
customerSchema.pre("save", function (next) {
  const defaults = this.addresses.filter((a) => a.isDefault);
  if (defaults.length > 1) {
    defaults.slice(0, -1).forEach((a) => (a.isDefault = false));
  }
  next();
});

const Customer = mongoose.model("Customer", customerSchema);
export default Customer;
