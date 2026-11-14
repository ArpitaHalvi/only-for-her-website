import mongoose from "mongoose";

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, default: "" },
    publicId: { type: String, default: "" },
  },
  { _id: false },
);

/**
 * One block of the storefront homepage. The homepage is the visible sections
 * in `sortOrder`, so the owner can add, remove, hide and reorder them.
 *
 *   featured_products   products marked "featured"
 *   bestsellers         products marked "bestseller"
 *   new_arrivals        products marked "new arrival"
 *   product_list        hand-picked `products`
 *   category_grid       `categories` (or top-level categories when none picked)
 *   collection_grid     `collections` (or featured collections when none picked)
 *   collection          one `featuredCollection` with its banner and products
 *   banner              an image with a heading and a button (desktop + mobile image)
 *   rich_text           a heading and a block of text / HTML
 *   hero                the hero banners (managed under Banners) at this position
 */
export const SECTION_TYPES = [
  "hero",
  "featured_products",
  "bestsellers",
  "new_arrivals",
  "product_list",
  "category_grid",
  "collection_grid",
  "collection",
  "banner",
  "rich_text",
];

const homeSectionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: SECTION_TYPES, required: [true, "Section type is required"] },
    // Internal name shown in the admin list
    name: { type: String, trim: true, maxlength: 80 },

    title: { type: String, trim: true, maxlength: 120 },
    subtitle: { type: String, trim: true, maxlength: 300 },
    ctaText: { type: String, trim: true, maxlength: 40 },
    ctaLink: {
      type: String,
      trim: true,
      validate: {
        validator: (v) => !v || /^(\/(?!\/)|https?:\/\/)/i.test(v),
        message: 'Link must start with "/" (a page on the site) or "http(s)://".',
      },
    },
    body: { type: String, maxlength: 20000 }, // rich_text / banner text

    image: { type: imageSchema, default: () => ({}) }, // desktop
    mobileImage: { type: imageSchema, default: () => ({}) },

    products: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: "ProductCategory" }],
    collections: [{ type: mongoose.Schema.Types.ObjectId, ref: "Collection" }],
    featuredCollection: { type: mongoose.Schema.Types.ObjectId, ref: "Collection", default: null },
    // How many products an automatic section shows
    limit: { type: Number, min: 1, max: 24, default: 8 },

    isVisible: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    // Optional schedule: outside it the section is hidden without switching it off
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

homeSectionSchema.index({ isVisible: 1, sortOrder: 1 });

export default mongoose.model("HomeSection", homeSectionSchema);
