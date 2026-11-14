import mongoose from "mongoose";
import { slugify } from "../utils/slug.js";

// Admin-managed attribute definitions, e.g. Size -> ["8mm", "10mm", "12mm"].
// Variants store their choices in `attributes` keyed by this slug
// ({ size: "10mm" }) and the product model checks them against `values`.
const productAttributeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Attribute name is required"],
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    values: {
      type: [{ type: String, trim: true }],
      default: [],
    },
  },
  { timestamps: true },
);

productAttributeSchema.pre("validate", function (next) {
  if (!this.slug && this.name) this.slug = slugify(this.name);
  next();
});

const ProductAttribute = mongoose.model(
  "ProductAttribute",
  productAttributeSchema,
);

export default ProductAttribute;
