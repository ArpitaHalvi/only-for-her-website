import mongoose from "mongoose";

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, default: "" },
    publicId: { type: String, default: "" },
  },
  { _id: false },
);

// A banner shown under the storefront's hero. Clicking it opens `link`.
const offerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Offer title is required"],
      trim: true,
    },
    image: { type: imageSchema, default: () => ({}) }, // desktop
    mobileImage: { type: imageSchema, default: () => ({}) }, // optional phone version
    subtitle: { type: String, trim: true, maxlength: 200 },
    ctaText: { type: String, trim: true, maxlength: 40 },
    // "hero" = the big banners at the top of the homepage, "promo" = banners under them
    placement: { type: String, enum: ["hero", "promo"], default: "promo", index: true },

    // Where a click goes: a path on the site ("/products?sale=1") or a full https:// address.
    link: {
      type: String,
      trim: true,
      default: "/shop",
      validate: {
        validator: (v) => !v || /^(\/(?!\/)|https?:\/\/)/i.test(v),
        message: 'Link must start with "/" (a page on the site) or "http(s)://".',
      },
    },

    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0, min: 0 },

    // Optional schedule. Outside it the banner is hidden without switching it off.
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
  },
  { timestamps: true },
);

offerSchema.index({ isActive: 1, sortOrder: 1 });

offerSchema.pre("validate", function (next) {
  if (this.startsAt && this.endsAt && this.endsAt < this.startsAt) {
    this.invalidate("endsAt", "End date must be after the start date.");
  }
  next();
});

export default mongoose.model("Offer", offerSchema);
