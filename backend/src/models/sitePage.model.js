import mongoose from "mongoose";

/**
 * Editable website pages. One document per page `key`; the admin edits the
 * text and SEO, the key itself is fixed so the storefront knows where it goes.
 */
export const PAGE_KEYS = [
  "about-us",
  "faq",
  "contact-info",
  "shipping-policy",
  "return-policy",
  "privacy-policy",
  "terms-and-conditions",
  "jewellery-care-guide",
];

export const PAGE_TITLES = {
  "about-us": "About Us",
  faq: "FAQ",
  "contact-info": "Contact Information",
  "shipping-policy": "Shipping Policy",
  "return-policy": "Return Policy",
  "privacy-policy": "Privacy Policy",
  "terms-and-conditions": "Terms and Conditions",
  "jewellery-care-guide": "Jewellery Care Guide",
};

const sitePageSchema = new mongoose.Schema(
  {
    key: { type: String, enum: PAGE_KEYS, required: true, unique: true },
    title: { type: String, trim: true, maxlength: 150 },
    // Page text (HTML from the rich text editor)
    body: { type: String, maxlength: 100000, default: "" },
    // Used by the FAQ page (and any page that wants a question list)
    faqs: {
      type: [
        {
          question: { type: String, required: true, trim: true, maxlength: 300 },
          answer: { type: String, required: true, trim: true, maxlength: 3000 },
          sortOrder: { type: Number, default: 0 },
          _id: false,
        },
      ],
      default: [],
      validate: [(v) => v.length <= 100, "At most 100 questions."],
    },
    isPublished: { type: Boolean, default: true },
    metaTitle: { type: String, trim: true, maxlength: 70 },
    metaDescription: { type: String, trim: true, maxlength: 170 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, versionKey: false },
);

export default mongoose.model("SitePage", sitePageSchema);
