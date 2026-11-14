import ProductAttribute from "../models/productAttribute.model.js";
import Product from "../models/product.model.js";
import { slugify } from "../utils/slug.js";

const isObjectId = (value) => /^[0-9a-fA-F]{24}$/.test(value);

// Values arrive as an array (JSON) or as a comma separated string (forms).
const parseValues = (raw) => {
  const list = Array.isArray(raw) ? raw : String(raw).split(",");
  return [...new Set(list.map((v) => String(v).trim()).filter(Boolean))];
};

const sendError = (res, error) => {
  if (error.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: Object.values(error.errors).map((e) => e.message).join(" "),
    });
  }
  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "An attribute with this slug already exists.",
    });
  }
  return res.status(500).json({ success: false, message: "Internal Server Error" });
};

// @desc    List attributes (all of them; the list is short)
// @route   GET /api/v1/product-attributes
// @access  Public
export const getProductAttributes = async (req, res) => {
  try {
    const { search } = req.query;
    const query = search ? { name: { $regex: search, $options: "i" } } : {};
    const data = await ProductAttribute.find(query).sort({ name: 1 });
    res.status(200).json({ success: true, data, totalCount: data.length });
  } catch (error) {
    console.error("[productAttribute.controller.js]", error.message);
    sendError(res, error);
  }
};

// @desc    Get one attribute by slug or id
// @route   GET /api/v1/product-attributes/:slugOrId
// @access  Public
export const getProductAttributeBySlugOrId = async (req, res) => {
  try {
    const { slugOrId } = req.params;
    const query = isObjectId(slugOrId) ? { _id: slugOrId } : { slug: slugOrId };
    const attribute = await ProductAttribute.findOne(query);
    if (!attribute) {
      return res
        .status(404)
        .json({ success: false, message: "Attribute not found" });
    }
    res.status(200).json({ success: true, data: attribute });
  } catch (error) {
    console.error("[productAttribute.controller.js]", error.message);
    sendError(res, error);
  }
};

// @desc    Create an attribute
// @route   POST /api/v1/product-attributes
// @access  Private/Admin
export const createProductAttribute = async (req, res) => {
  try {
    const { name, slug, values } = req.body;
    if (!name?.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Attribute name is required" });
    }
    const attribute = await ProductAttribute.create({
      name,
      slug: slug ? slugify(slug) : undefined,
      values: values ? parseValues(values) : [],
    });
    res.status(201).json({
      success: true,
      message: "Attribute created successfully",
      data: attribute,
    });
  } catch (error) {
    console.error("[productAttribute.controller.js]", error.message);
    sendError(res, error);
  }
};

// @desc    Update an attribute (its slug is the key stored on variants, so it
//          is not changed here)
// @route   PUT /api/v1/product-attributes/:id
// @access  Private/Admin
export const updateProductAttribute = async (req, res) => {
  try {
    const attribute = await ProductAttribute.findById(req.params.id);
    if (!attribute) {
      return res
        .status(404)
        .json({ success: false, message: "Attribute not found" });
    }
    const { name, values } = req.body;
    if (name !== undefined) attribute.name = name;
    if (values !== undefined) attribute.values = parseValues(values);
    await attribute.save();
    res.status(200).json({
      success: true,
      message: "Attribute updated successfully",
      data: attribute,
    });
  } catch (error) {
    console.error("[productAttribute.controller.js]", error.message);
    sendError(res, error);
  }
};

// @desc    Delete an attribute (blocked while a variant still uses it)
// @route   DELETE /api/v1/product-attributes/:id
// @access  Private/Admin
export const deleteProductAttribute = async (req, res) => {
  try {
    const attribute = await ProductAttribute.findById(req.params.id);
    if (!attribute) {
      return res
        .status(404)
        .json({ success: false, message: "Attribute not found" });
    }
    const inUse = await Product.countDocuments({
      [`variants.attributes.${attribute.slug}`]: { $exists: true },
    });
    if (inUse) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete: ${inUse} product${inUse !== 1 ? "s" : ""} still ${inUse !== 1 ? "use" : "uses"} this attribute on a variant.`,
      });
    }
    await attribute.deleteOne();
    res
      .status(200)
      .json({ success: true, message: "Attribute deleted successfully" });
  } catch (error) {
    console.error("[productAttribute.controller.js]", error.message);
    sendError(res, error);
  }
};
