import mongoose from "mongoose";
import { uniqueSlug } from "../utils/slug.js";

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, default: "" },
    publicId: { type: String, default: "" },
  },
  { _id: false },
);

const productCategorySchema = new mongoose.Schema(
  {
    // Parent category (nested categories). null = top level.
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductCategory",
      default: null,
    },

    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },

    // Media
    image: { type: imageSchema, default: () => ({}) },
    banner: { type: imageSchema, default: () => ({}) },
    icon: { type: String, trim: true }, // icon path or class name

    shortDescription: { type: String, trim: true },
    description: { type: String, trim: true },

    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0, min: 0 },

    // SEO
    metaTitle: { type: String, trim: true },
    metaKeywords: { type: String, trim: true },
    metaDescription: { type: String, trim: true },

    // Soft delete
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

productCategorySchema.index({ parent: 1, sortOrder: 1 });
productCategorySchema.index({ parent: 1, name: 1 });

// The slug is created once, so renaming a category never breaks its URL.
productCategorySchema.pre("validate", async function (next) {
  try {
    if (this.isNew && !this.slug && this.name) {
      this.slug = await uniqueSlug(this.constructor, this.name);
    }
    if (this.parent && this._id && this.parent.equals(this._id)) {
      this.invalidate("parent", "A category cannot be its own parent.");
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Soft-deleted categories are hidden unless a query opts in with
// .setOptions({ withDeleted: true }).
productCategorySchema.pre(/^find|^count/, function (next) {
  if (!this.getOptions().withDeleted) this.where({ deletedAt: null });
  next();
});

const ProductCategory = mongoose.model(
  "ProductCategory",
  productCategorySchema,
);

export default ProductCategory;
