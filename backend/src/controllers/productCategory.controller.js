import {
  uploadToCloudinary,
  destroyFromCloudinary,
} from "../utils/cloudinaryService.js";
import ProductCategory from "../models/productCategory.model.js";
import Product from "../models/product.model.js";

const CLOUDINARY_FOLDER = "only-for-her/categories";

// Fields an admin can set through the body.
const EDITABLE_FIELDS = [
  "parent",
  "name",
  "slug",
  "icon",
  "shortDescription",
  "description",
  "isActive",
  "isFeatured",
  "sortOrder",
  "metaTitle",
  "metaKeywords",
  "metaDescription",
];

const IMAGE_FIELDS = ["image", "banner"];

const isObjectId = (value) => /^[0-9a-fA-F]{24}$/.test(value);

const pickFields = (body) => {
  const data = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] === undefined) continue;
    // "" / "null" from a form means "no parent" (top level).
    data[field] =
      field === "parent" && (body.parent === "" || body.parent === "null")
        ? null
        : body[field];
  }
  return data;
};

const upload = async (file) => {
  const result = await uploadToCloudinary(
    file.path || file.buffer,
    CLOUDINARY_FOLDER,
  );
  return { url: result.secure_url || result.url, publicId: result.public_id };
};

// Uploads the image / banner files present on the request. Returns the old
// assets so they can be deleted once the new data has been saved.
const applyImages = async (req, category) => {
  const old = [];
  for (const field of IMAGE_FIELDS) {
    const file = req.files?.[field]?.[0];
    if (!file) continue;
    if (category[field]?.publicId) old.push(category[field].publicId);
    category[field] = await upload(file);
  }
  return old;
};

const destroyAll = (publicIds) =>
  Promise.all(publicIds.map((id) => destroyFromCloudinary(id))).catch((err) =>
    console.log("Old asset cleanup skip:", err.message),
  );

const sendError = (res, error) => {
  if (error.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: Object.values(error.errors)
        .map((e) => e.message)
        .join(" "),
    });
  }
  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "A category with this slug already exists.",
    });
  }
  return res
    .status(error.status || 500)
    .json({ success: false, message: error.status && error.status < 500 ? error.message : "Internal Server Error" });
};

// A category may not be moved under one of its own descendants.
const isDescendant = async (categoryId, candidateParentId) => {
  let current = candidateParentId;
  const seen = new Set();
  while (current && !seen.has(String(current))) {
    if (String(current) === String(categoryId)) return true;
    seen.add(String(current));
    const node = await ProductCategory.findById(current).select("parent");
    current = node?.parent;
  }
  return false;
};

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A sibling with the same name is a duplicate (the same name is fine under
// a different parent).
const siblingExists = (name, parent, excludeId) =>
  ProductCategory.exists({
    name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
    parent: parent || null,
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  });

// @desc    Create a new category
// @route   POST /api/v1/product-categories
// @access  Private/Admin
const createProductCategory = async (req, res) => {
  try {
    const data = pickFields(req.body);
    if (!data.name) {
      return res
        .status(400)
        .json({ success: false, message: "Category name is required" });
    }
    if (await siblingExists(data.name, data.parent)) {
      return res
        .status(400)
        .json({ success: false, message: "Category already exists" });
    }

    const category = new ProductCategory(data);
    await applyImages(req, category);
    await category.save();

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: category,
    });
  } catch (error) {
    console.error("[productCategory.controller.js]", error.message);
    sendError(res, error);
  }
};

// @desc    Get product categories (pagination, search, filters)
// @route   GET /api/v1/product-categories
// @query   page, limit, search, parent ("null" = top level), featured
// @access  Public
const getProductCategories = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const { search, parent, featured } = req.query;

    const query = { isActive: true };
    if (search) query.name = { $regex: search, $options: "i" };
    if (parent === "null") query.parent = null;
    else if (parent) query.parent = parent;
    if (featured === "true") query.isFeatured = true;

    const total = await ProductCategory.countDocuments(query);
    const categories = await ProductCategory.find(query)
      .sort({ sortOrder: 1, name: 1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return res.status(200).json({
      success: true,
      message: "Product Categories fetched successfully.",
      data: categories,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("[productCategory.controller.js]", error.message);
    res.status(500).json({
      success: false,
      message: "Internal Error",
    });
  }
};

// @desc    Admin list: paginated, includes inactive categories
// @route   GET /api/v1/product-categories/admin/list
// @query   page, limit, search, status (active|inactive)
// @access  Private/Admin
const getAdminProductCategories = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const { search, status } = req.query;

    const query = {};
    if (search) query.name = { $regex: escapeRegex(String(search)), $options: "i" };
    if (status === "active") query.isActive = true;
    if (status === "inactive") query.isActive = false;

    const total = await ProductCategory.countDocuments(query);
    const categories = await ProductCategory.find(query)
      .populate("parent", "name slug")
      .sort({ sortOrder: 1, name: 1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.status(200).json({
      success: true,
      data: categories,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("[productCategory.controller.js]", error.message);
    sendError(res, error);
  }
};

// @desc    Get every category, including inactive ones (admin)
// @route   GET /api/v1/product-categories/all
// @access  Private/Admin
const getAllProductCategories = async (_req, res) => {
  try {
    const categories = await ProductCategory.find().sort({
      sortOrder: 1,
      name: 1,
    });
    return res.status(200).json({
      success: true,
      message: "Product Categories fetched successfully.",
      data: categories,
      totalCount: categories.length,
    });
  } catch (error) {
    console.error("[productCategory.controller.js]", error.message);
    res.status(500).json({
      success: false,
      message: "Internal Error",
    });
  }
};

// @desc    Get single category by slug or ID (with its sub-categories)
// @route   GET /api/v1/product-categories/:slugOrId
// @access  Public
const getProductCategoryBySlugOrId = async (req, res) => {
  try {
    const { slugOrId } = req.params;
    const query = isObjectId(slugOrId) ? { _id: slugOrId } : { slug: slugOrId };

    const category = await ProductCategory.findOne(query).populate(
      "parent",
      "name slug",
    );
    if (!category) {
      return res
        .status(404)
        .json({ success: false, message: "Product Category not found" });
    }

    const children = await ProductCategory.find({
      parent: category._id,
      isActive: true,
    }).sort({ sortOrder: 1, name: 1 });

    res.status(200).json({
      success: true,
      data: { ...category.toObject(), children },
    });
  } catch (error) {
    console.error("[productCategory.controller.js]", error.message);
    sendError(res, error);
  }
};

// Shared by PUT and PATCH: both load the category, apply the fields that were
// sent and save, so validation and hooks always run.
const updateCategory = (message) => async (req, res) => {
  try {
    const category = await ProductCategory.findById(req.params.id);
    if (!category) {
      return res
        .status(404)
        .json({ success: false, message: "Product Category not found" });
    }

    const data = pickFields(req.body);

    if (data.parent !== undefined && data.parent !== null) {
      if (await isDescendant(category._id, data.parent)) {
        return res.status(400).json({
          success: false,
          message: "A category cannot be moved under itself or its own child.",
        });
      }
    }

    const name = data.name ?? category.name;
    const parent = data.parent !== undefined ? data.parent : category.parent;
    if (
      (data.name !== undefined || data.parent !== undefined) &&
      (await siblingExists(name, parent, category._id))
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Category already exists" });
    }

    category.set(data);
    const old = await applyImages(req, category);
    await category.save();
    await destroyAll(old); // only after the new data is safely saved

    res.status(200).json({ success: true, message, data: category });
  } catch (error) {
    console.error("[productCategory.controller.js]", error.message);
    sendError(res, error);
  }
};

const updateProductCategory = updateCategory(
  "Product Category updated successfully",
);
const partiallyUpdateProductCategory = updateCategory(
  "Product Category partially updated successfully",
);

// @desc    Soft-delete a category
// @route   DELETE /api/v1/product-categories/:id
// @access  Private/Admin
const deleteProductCategory = async (req, res) => {
  try {
    const category = await ProductCategory.findById(req.params.id);
    if (!category) {
      return res
        .status(404)
        .json({ success: false, message: "Category not found" });
    }

    const [children, products] = await Promise.all([
      ProductCategory.countDocuments({ parent: category._id }),
      Product.countDocuments({ category: category._id }),
    ]);
    if (children || products) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete: this category still has ${children} sub-categories and ${products} products. Move or delete them first.`,
      });
    }

    // Images are kept so the category can be restored.
    category.deletedAt = new Date();
    category.isActive = false;
    await category.save();

    res
      .status(200)
      .json({ success: true, message: "Product Category deleted successfully" });
  } catch (error) {
    console.error("[productCategory.controller.js]", error.message);
    sendError(res, error);
  }
};

export {
  createProductCategory,
  getProductCategories,
  getAdminProductCategories,
  getAllProductCategories,
  getProductCategoryBySlugOrId,
  updateProductCategory,
  partiallyUpdateProductCategory,
  deleteProductCategory,
};
