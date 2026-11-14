import mongoose from "mongoose";
import ProductAttribute from "./productAttribute.model.js";
import { uniqueSlug } from "../utils/slug.js";

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
  },
  { _id: false },
);

// salePrice, when present, must be lower than the regular price it belongs to.
const salePriceBelowPrice = {
  validator(value) {
    return value == null || this.price == null || value < this.price;
  },
  message: "salePrice must be lower than price.",
};

// A purchasable option of a product, e.g. "12 mm". The variant's own price /
// salePrice override the product's when set.
const productVariantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Variant name is required"],
    trim: true,
  },
  sku: {
    type: String,
    required: [true, "Variant SKU is required"],
    trim: true,
  },
  price: { type: Number, min: 0, default: null },
  salePrice: {
    type: Number,
    min: 0,
    default: null,
    validate: salePriceBelowPrice,
  },
  stock: { type: Number, min: 0, default: 0 },

  // Free-form choices keyed by ProductAttribute slug, e.g. { size: "12mm" }.
  attributes: { type: Map, of: String, default: {} },
},
{
  // Sub-document schemas need their own option for virtuals (inStock).
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

productVariantSchema.virtual("inStock").get(function () {
  return this.stock > 0;
});

const productSchema = new mongoose.Schema(
  {
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductCategory",
      required: [true, "Product must belong to a category"],
    },

    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    sku: {
      type: String,
      required: [true, "Product SKU is required"],
      unique: true,
      trim: true,
    },
    // HSN code printed on GST invoices (4 to 8 digits). Empty = the store's default HSN.
    hsnCode: {
      type: String,
      trim: true,
      match: [/^[0-9]{4,8}$/, "HSN code must be 4 to 8 digits."],
    },

    thumbnail: { type: imageSchema, default: null },
    gallery: { type: [imageSchema], default: [] },

    // price = regular price, salePrice = discounted price (optional)
    price: {
      type: Number,
      required: [true, "Product price is required"],
      min: 0,
    },
    salePrice: {
      type: Number,
      min: 0,
      default: null,
      validate: salePriceBelowPrice,
    },

    stock: { type: Number, min: 0, default: 0 },

    // false = unpublished (hidden from the shop, kept in the admin)
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    isBestseller: { type: Boolean, default: false }, // "Bestseller" badge / homepage list
    isNewArrival: { type: Boolean, default: false }, // "New" badge / homepage list
    // Custom product: not bought online. The customer messages the shop on
    // WhatsApp to have it made to their requirements (/custom-products).
    isCustom: { type: Boolean, default: false },
    // Made for children. Used by the storefront's Kids section (?kids=true).
    isKids: { type: Boolean, default: false },

    shortDescription: { type: String, trim: true },
    description: { type: String },

    variants: { type: [productVariantSchema], default: [] },

    // Product videos (YouTube / Vimeo / a direct video link)
    videos: {
      type: [{ url: { type: String, required: true, trim: true, maxlength: 500 }, title: { type: String, trim: true, maxlength: 120 }, _id: false }],
      default: [],
      validate: [(v) => v.length <= 5, "A product can have at most 5 videos."],
    },

    // Free-form details that differ by product, e.g. a necklace has { "Chain length": "18 in" },
    // a ring has { "Ring size": "Adjustable" }. Nothing is forced on every product.
    specifications: {
      type: [{ label: { type: String, required: true, trim: true, maxlength: 60 }, value: { type: String, required: true, trim: true, maxlength: 200 }, _id: false }],
      default: [],
      validate: [(v) => v.length <= 30, "A product can have at most 30 specifications."],
    },

    // ── Fashion-jewellery details (not precious metal: no purity / hallmark) ──
    // Base metal or material, e.g. "Brass", "Alloy", "Stainless steel", "Beads"
    material: { type: String, trim: true, maxlength: 80 },
    // Surface treatment, e.g. "Gold plated", "Rose gold plated", "Oxidised", "Rhodium"
    plating: { type: String, trim: true, maxlength: 80 },
    // Main colour / finish shown to shoppers, e.g. "Antique gold", "Silver", "Multicolour"
    color: { type: String, trim: true, maxlength: 60 },
    // e.g. "American diamond", "Kundan", "Pearl", "Crystal", "None"
    stoneType: { type: String, trim: true, maxlength: 80 },
    // e.g. "Traditional", "Western", "Boho", "Minimal", "Statement"
    style: { type: String, trim: true, maxlength: 60 },
    occasion: { type: [String], default: [] }, // "Wedding", "Party", "Daily wear", ...
    gender: { type: String, enum: ["women", "girls", "men", "unisex"], default: "women" },
    weightGrams: { type: Number, min: 0, default: null },
    dimensions: {
      length: { type: Number, min: 0, default: null }, // all in millimetres
      width: { type: Number, min: 0, default: null },
      height: { type: Number, min: 0, default: null },
    },
    isAntiTarnish: { type: Boolean, default: false },
    isHypoallergenic: { type: Boolean, default: false }, // nickel / lead free
    careInstructions: { type: String, trim: true, maxlength: 1000 },
    includedItems: { type: String, trim: true, maxlength: 300 }, // "1 necklace + 2 earrings"
    tags: { type: [String], default: [] },
    // Deity or symbol on the piece, e.g. "Lord Ganesha", "Om" (a piece can show more than one)
    deities: { type: [String], default: [] },

    // ── Trust and authenticity (say only what is true: plated / imitation pieces are not solid metal) ──
    // e.g. "Brass base, 1 micron gold plating, glass stones"
    materialComposition: { type: String, trim: true, maxlength: 300 },
    warranty: {
      months: { type: Number, min: 0, max: 120, default: null },
      details: { type: String, trim: true, maxlength: 300 },
    },
    certificate: {
      name: { type: String, trim: true, maxlength: 100 },
      number: { type: String, trim: true, maxlength: 60 },
      issuedBy: { type: String, trim: true, maxlength: 100 },
      url: { type: String, trim: true, maxlength: 500 },
    },
    collections: [{ type: mongoose.Schema.Types.ObjectId, ref: "Collection" }],
    // Costume jewellery is often final-sale (e.g. earrings): false = cannot be returned
    returnable: { type: Boolean, default: true },
    // Admin "low stock" alert when stock (or any variant) falls to this or below
    lowStockThreshold: { type: Number, min: 0, default: 5 },

    // What a customer pays: salePrice when set, otherwise price. Derived on
    // every validate so it can be filtered and sorted on.
    effectivePrice: { type: Number, min: 0, default: 0 },

    // Kept up to date by review.model.js whenever a review is saved/removed.
    rating: { type: Number, min: 0, max: 5, default: 0 },
    reviewCount: { type: Number, min: 0, default: 0 },

    // SEO
    metaTitle: { type: String, trim: true },
    metaKeywords: { type: String, trim: true },
    metaDescription: { type: String, trim: true },

    // Soft delete
    deletedAt: { type: Date, default: null },

    // --- Not part of the migration. Commented out on purpose; restore if needed.
    // ageGroup: { type: String, enum: ["0-2", "3-5", "6-8", "9-12", "13+", "all"], default: "all" },
    // specifications: { material, batteryRequired, batteryType, dimensions, weight, safetyStandards, includedItems },
    // badge: { type: String, default: null },
    // soldCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Derived, so they can never get out of date.
productSchema.virtual("inStock").get(function () {
  return this.variants?.length
    ? this.variants.some((v) => v.stock > 0)
    : this.stock > 0;
});
productSchema.virtual("discountPercent").get(function () {
  return this.salePrice != null && this.price > 0
    ? Math.round(((this.price - this.salePrice) / this.price) * 100)
    : 0;
});

productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ isBestseller: 1, isActive: 1 });
productSchema.index({ isNewArrival: 1, isActive: 1 });
productSchema.index({ isFeatured: 1, isActive: 1 });
productSchema.index({ isCustom: 1, isActive: 1 });
productSchema.index({ isKids: 1, isActive: 1 });
productSchema.index({ effectivePrice: 1 });
productSchema.index({ material: 1, isActive: 1 });
productSchema.index({ plating: 1, isActive: 1 });
productSchema.index({ gender: 1, isActive: 1 });
productSchema.index({ tags: 1 });
productSchema.index({ deities: 1, isActive: 1 });
productSchema.index({ collections: 1, isActive: 1 });
productSchema.index({ name: "text", shortDescription: "text" });
// Variant SKUs are unique across all products.
productSchema.index({ "variants.sku": 1 }, { unique: true, sparse: true });

productSchema.pre("validate", async function (next) {
  try {
    // The slug is created once, so renaming a product never breaks its URL.
    if (this.isNew && !this.slug && this.name) {
      this.slug = await uniqueSlug(this.constructor, this.name);
    }

    this.effectivePrice = this.salePrice ?? this.price;

    // The unique index does not catch duplicates inside one product.
    const skus = this.variants.map((v) => v.sku);
    if (new Set(skus).size !== skus.length) {
      this.invalidate("variants", "Variant SKUs must be unique.");
    }

    // Check variant attributes against the admin-defined ProductAttribute
    // values. Keys with no definition are allowed (free-form).
    if (this.isModified("variants")) {
      const keys = new Set();
      this.variants.forEach((v) => v.attributes?.forEach((_, k) => keys.add(k)));
      if (keys.size) {
        const defs = await ProductAttribute.find({ slug: { $in: [...keys] } });
        const allowed = new Map(defs.map((d) => [d.slug, d.values]));
        this.variants.forEach((v, i) => {
          v.attributes?.forEach((value, key) => {
            const values = allowed.get(key);
            if (values?.length && !values.includes(value)) {
              this.invalidate(
                `variants.${i}.attributes.${key}`,
                `"${value}" is not an allowed value for "${key}".`,
              );
            }
          });
        });
      }
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Soft-deleted products are hidden unless a query opts in with
// .setOptions({ withDeleted: true }).
productSchema.pre(/^find|^count/, function (next) {
  if (!this.getOptions().withDeleted) this.where({ deletedAt: null });
  next();
});

const Product = mongoose.model("Product", productSchema);
export default Product;
