import mongoose from "mongoose";
import { uniqueSlug } from "../utils/slug.js";

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
  },
  { _id: false },
);

// A themed grouping that cuts across categories, e.g. "Bridal", "Festive 2026",
// "Office wear". A product can belong to several collections.
const collectionSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Collection name is required"], trim: true, maxlength: 100 },
    slug: { type: String, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true, maxlength: 2000 },
    image: { type: imageSchema, default: null },
    banner: { type: imageSchema, default: null },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    metaTitle: { type: String, trim: true },
    metaDescription: { type: String, trim: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

collectionSchema.index({ isActive: 1, sortOrder: 1 });

collectionSchema.pre("validate", async function (next) {
  try {
    if (this.isNew && !this.slug && this.name) {
      this.slug = await uniqueSlug(this.constructor, this.name);
    }
    next();
  } catch (err) {
    next(err);
  }
});

collectionSchema.pre(/^find|^count/, function (next) {
  if (!this.getOptions().withDeleted) this.where({ deletedAt: null });
  next();
});

export default mongoose.model("Collection", collectionSchema);
