import mongoose from "mongoose";

const appconfigSchema = new mongoose.Schema(
  {
    appName: {
      type: String,
      required: true,
    },
    phoneNumber: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    companyAddress: [
      {
        address: String,
        googleMapLocation: String,
      },
    ],
    // YouTube videos for the website's "Watch & learn" section
    videos: [
      {
        title: { type: String, trim: true },
        url: { type: String, trim: true, required: true },
        _id: false,
      },
    ],
    facebookLink: {
      type: String,
      required: false,
    },
    instagramLink: {
      type: String,
      required: false,
    },
    twitterLink: {
      type: String,
      required: false,
    },
    youtubeLink: {
      type: String,
      required: false,
    },
    whatsAppLink: {
      type: String,
      required: false,
    },
    googleFormLink: {
      type: String,
      required: false,
    },
    linkedinLink: {
      type: String,
      required: false,
    },
    // ── Store settings used at checkout ──────────────────────────────────
    // "inclusive": prices already contain tax. "exclusive": tax is added at checkout.
    taxMode: { type: String, enum: ["inclusive", "exclusive"], default: "inclusive" },
    // GST / tax percentage. 0 = no tax line.
    taxRate: { type: Number, min: 0, max: 100, default: 0 },
    // Flat shipping charge in rupees. 0 = free shipping.
    shippingCharge: { type: Number, min: 0, default: 0 },
    // Orders at or above this amount ship free. Empty = no free-shipping rule.
    freeShippingAbove: { type: Number, min: 0, default: null },
    // Cash on delivery: can be switched off, can carry a handling fee, and can be
    // limited to smaller orders (empty = no limit).
    codEnabled: { type: Boolean, default: true },
    codCharge: { type: Number, min: 0, default: 0 },
    codMaxAmount: { type: Number, min: 0, default: null },
    // Returns / exchanges: days after delivery a customer can ask. 0 = returns are switched off.
    returnWindowDays: { type: Number, min: 0, max: 90, default: 7 },
    // Printed on the returns page, e.g. the address to send parcels back to
    returnPolicyNote: { type: String, trim: true, maxlength: 600 },

    // ── Delivery area ────────────────────────────────────────────────────
    // open: deliver everywhere except PIN codes marked not serviceable.
    // listed: deliver only to the PIN codes added under Serviceability.
    serviceabilityMode: { type: String, enum: ["open", "listed"], default: "open" },

    // ── Gifting ──────────────────────────────────────────────────────────
    // Wrap choices shown at checkout, e.g. { name: "Premium gift box", price: 99 }
    giftWrapOptions: {
      type: [
        {
          name: { type: String, required: true, trim: true, maxlength: 60 },
          description: { type: String, trim: true, maxlength: 200 },
          price: { type: Number, min: 0, default: 0 },
          image: { type: String, trim: true }, // picture of the packaging
          isActive: { type: Boolean, default: true },
        },
      ],
      default: [],
      validate: [(v) => v.length <= 12, "At most 12 gift wrap options."],
    },

    // ── WhatsApp ─────────────────────────────────────────────────────────
    // Number for the floating chat button, digits with country code (e.g. 919876543210)
    whatsappNumber: { type: String, trim: true, match: [/^[0-9]{10,15}$/, "WhatsApp number: digits only with country code, e.g. 919876543210."] },
    // First message the chat opens with. {product} is replaced on product pages.
    whatsappMessage: { type: String, trim: true, maxlength: 300 },
    // Show the floating WhatsApp button
    whatsappButtonEnabled: { type: Boolean, default: true },

    // Default SEO for pages that do not set their own
    seoTitle: { type: String, trim: true, maxlength: 70 },
    seoDescription: { type: String, trim: true, maxlength: 170 },
    seoKeywords: { type: String, trim: true, maxlength: 300 },

    // Where customers follow a parcel. {trackingNumber} is replaced, e.g.
    // https://www.delhivery.com/track/package/{trackingNumber}
    trackingUrlTemplate: { type: String, trim: true },

    // ── Invoice / GST details (printed on invoices) ──────────────────────
    // Registered for GST: invoices are "Tax Invoice" with the GST split.
    // Not registered: invoices are a "Bill of Supply" with no tax shown.
    gstRegistered: { type: Boolean, default: false },
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
      match: [/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "GSTIN must be 15 characters, like 27AAAAA0000A1Z5."],
    },
    legalName: { type: String, trim: true, maxlength: 150 },
    businessAddress: { type: String, trim: true, maxlength: 400 },
    // Used to choose CGST + SGST (same state as the customer) or IGST
    businessState: { type: String, trim: true },
    invoicePrefix: { type: String, trim: true, uppercase: true, match: [/^[A-Z0-9-]{1,10}$/, "Prefix: up to 10 letters, digits or dashes."], default: "OFH" },
    defaultHsn: { type: String, trim: true, match: [/^[0-9]{4,8}$/, "HSN code must be 4 to 8 digits."] },
    invoiceNote: { type: String, trim: true, maxlength: 600 },

    googleAppStoreLink: {
      type: String,
      required: false,
    },
    appleAppStoreLink: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

const appConfig = mongoose.model("appConfig", appconfigSchema);
export default appConfig;
