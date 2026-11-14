// app/features/products/components/form.tsx
import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { XIcon, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { useFileUpload } from "@/hooks/use-file-upload";
import { toast } from "sonner";
import { useNavigate, useParams } from "react-router";
import {
  useCreateProductMutation,
  useUpdateProductMutation,
  useGetProductByIdQuery,
} from "../data/productApi";
import { Combobox } from "@/components/crud/Combobox";
import ImageField from "@/components/crud/ImageField";
import { useGetProductCategoriesAllQuery } from "~/features/product-categories/data/productCategoryApi";
import { useGetProductAttributesQuery } from "~/features/product-attributes/data/productAttributeApi";

// ── Types ──────────────────────────────────────────────────────────────────

interface AttributeRow {
  key: string; // attribute slug
  value: string;
}

/** One row in the variants section */
interface VariantFormRow {
  _id?: string;
  name: string;
  sku: string;
  price: string;
  salePrice: string;
  stock: string;
  attributes: AttributeRow[];
}

interface FormValues {
  name: string;
  sku: string;
  hsnCode: string;
  categoryId: string;
  shortDescription: string;
  description: string;
  price: string;
  salePrice: string;
  stock: string;
  isFeatured: boolean;
  isCustom: boolean;
  isKids: boolean;
  isActive: boolean;
  metaTitle: string;
  metaKeywords: string;
  metaDescription: string;
}

const emptyValues = (): FormValues => ({
  name: "",
  sku: "",
  hsnCode: "",
  categoryId: "",
  shortDescription: "",
  description: "",
  price: "",
  salePrice: "",
  stock: "0",
  isFeatured: false,
  isCustom: false,
  isKids: false,
  isActive: true,
  metaTitle: "",
  metaKeywords: "",
  metaDescription: "",
});

const emptyVariant = (): VariantFormRow => ({
  name: "",
  sku: "",
  price: "",
  salePrice: "",
  stock: "0",
  attributes: [],
});

const isNum = (v: string) => v !== "" && !isNaN(Number(v));

// ── Validation ─────────────────────────────────────────────────────────────

const validate = (values: FormValues, variants: VariantFormRow[]) => {
  const errors: Record<string, string> = {};

  if (!values.name.trim()) errors.name = "Product name is required.";
  else if (values.name.length > 200)
    errors.name = "Name cannot exceed 200 characters.";

  if (!values.sku.trim()) errors.sku = "SKU is required.";
  if (values.hsnCode.trim() && !/^[0-9]{4,8}$/.test(values.hsnCode.trim()))
    errors.hsnCode = "HSN code must be 4 to 8 digits.";
  if (!values.categoryId) errors.categoryId = "Please select a category.";

  if (!isNum(values.price) || Number(values.price) < 0)
    errors.price = "A valid price is required.";

  if (values.salePrice !== "") {
    if (!isNum(values.salePrice) || Number(values.salePrice) < 0)
      errors.salePrice = "Sale price must be a valid non-negative number.";
    else if (isNum(values.price) && Number(values.salePrice) >= Number(values.price))
      errors.salePrice = "Sale price must be lower than the regular price.";
  }

  if (values.stock !== "" && (!isNum(values.stock) || Number(values.stock) < 0))
    errors.stock = "Stock must be a non-negative number.";

  const seen = new Set<string>();
  variants.forEach((v, i) => {
    const key = (field: string) => `variant_${i}_${field}`;
    if (!v.name.trim()) errors[key("name")] = "Variant name is required.";
    if (!v.sku.trim()) errors[key("sku")] = "Variant SKU is required.";
    else if (seen.has(v.sku.trim().toLowerCase()))
      errors[key("sku")] = "Variant SKUs must be unique.";
    seen.add(v.sku.trim().toLowerCase());

    if (v.price !== "" && (!isNum(v.price) || Number(v.price) < 0))
      errors[key("price")] = "Price must be a non-negative number.";
    if (v.salePrice !== "") {
      const regular = v.price !== "" ? v.price : values.price;
      if (!isNum(v.salePrice) || Number(v.salePrice) < 0)
        errors[key("salePrice")] = "Sale price must be a non-negative number.";
      else if (isNum(regular) && Number(v.salePrice) >= Number(regular))
        errors[key("salePrice")] = "Sale price must be lower than its regular price.";
    }
    if (v.stock !== "" && (!isNum(v.stock) || Number(v.stock) < 0))
      errors[key("stock")] = "Stock must be a non-negative number.";
  });

  return errors;
};

const FieldError = ({ message }: { message?: string }) =>
  message ? <p className="text-xs text-red-500 mt-1">{message}</p> : null;

// ── Main Component ─────────────────────────────────────────────────────────

export default function ProductForm({
  mode = "create",
}: {
  mode?: "create" | "edit";
}) {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = mode === "edit" || !!id;

  const { data: productData, isLoading: loadingProduct } =
    useGetProductByIdQuery(id ?? "", { skip: !isEdit });

  const [createProduct] = useCreateProductMutation();
  const [updateProduct] = useUpdateProductMutation();

  const { data: catData } = useGetProductCategoriesAllQuery();
  const { data: attrData } = useGetProductAttributesQuery();

  const [values, setValues] = useState<FormValues>(emptyValues());
  const [variants, setVariants] = useState<VariantFormRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Images
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [existingThumbnail, setExistingThumbnail] = useState<string | null>(null);
  const [existingGallery, setExistingGallery] = useState<
    { url: string; publicId: string }[]
  >([]);
  const [imagesKey, setImagesKey] = useState(0); // remounts the thumbnail picker

  const [
    { files: galleryFiles, isDragging: galleryDrag, errors: galleryErrors },
    galleryHandlers,
  ] = useFileUpload({
    accept: "image/*",
    maxSize: 5 * 1024 * 1024,
    multiple: true,
    maxFiles: 8,
  });

  const categoryOptions = useMemo(() => {
    const list = Array.isArray(catData?.data) ? catData.data : [];
    return list.map((cat: any) => ({ label: cat.name, value: cat._id }));
  }, [catData]);

  const attributes = useMemo(
    () => (Array.isArray(attrData?.data) ? attrData.data : []),
    [attrData],
  );

  // ── Prefill for edit mode ────────────────────────────────────────────────
  useEffect(() => {
    const p = productData?.data;
    if (!p) return;
    setValues({
      name: p.name || "",
      sku: p.sku || "",
      hsnCode: (p as any).hsnCode || "",
      categoryId:
        typeof p.category === "object" ? (p.category as any)._id : p.category || "",
      shortDescription: p.shortDescription || "",
      description: p.description || "",
      price: p.price != null ? String(p.price) : "",
      salePrice: p.salePrice != null ? String(p.salePrice) : "",
      stock: p.stock != null ? String(p.stock) : "0",
      isFeatured: p.isFeatured ?? false,
      isCustom: p.isCustom ?? false,
      isKids: p.isKids ?? false,
      isActive: p.isActive ?? true,
      metaTitle: p.metaTitle || "",
      metaKeywords: p.metaKeywords || "",
      metaDescription: p.metaDescription || "",
    });
    setExistingThumbnail(p.thumbnail?.url ?? null);
    setExistingGallery(p.gallery || []);
    setVariants(
      (p.variants ?? []).map((v: any) => ({
        _id: v._id,
        name: v.name || "",
        sku: v.sku || "",
        price: v.price != null ? String(v.price) : "",
        salePrice: v.salePrice != null ? String(v.salePrice) : "",
        stock: v.stock != null ? String(v.stock) : "0",
        attributes: Object.entries(v.attributes ?? {}).map(([key, value]) => ({
          key,
          value: String(value),
        })),
      })),
    );
  }, [productData]);

  const handleChange = (name: keyof FormValues, value: any) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const setVariant = (index: number, patch: Partial<VariantFormRow>) => {
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
    Object.keys(patch).forEach((field) => {
      const key = `variant_${index}_${field}`;
      if (errors[key]) setErrors((prev) => ({ ...prev, [key]: "" }));
    });
  };

  const setAttributeRow = (vi: number, ai: number, patch: Partial<AttributeRow>) =>
    setVariants((prev) =>
      prev.map((v, i) =>
        i === vi
          ? {
              ...v,
              attributes: v.attributes.map((a, j) => (j === ai ? { ...a, ...patch } : a)),
            }
          : v,
      ),
    );

  const addVariant = () => setVariants((prev) => [...prev, emptyVariant()]);
  const removeVariant = (index: number) =>
    setVariants((prev) => prev.filter((_, i) => i !== index));

  const resetForm = () => {
    setValues(emptyValues());
    setVariants([]);
    setErrors({});
    setThumbnailFile(null);
    setExistingThumbnail(null);
    setExistingGallery([]);
    galleryHandlers.clearFiles?.();
    setImagesKey((k) => k + 1);
  };

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async (
    e: React.FormEvent,
    actionType: "create" | "create_another" = "create",
  ) => {
    e.preventDefault();

    const newErrors = validate(values, variants);
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast.error("Please correct the highlighted errors.");
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("name", values.name.trim());
      formData.append("sku", values.sku.trim());
      formData.append("hsnCode", values.hsnCode.trim()); // "" clears it
      formData.append("category", values.categoryId);
      formData.append("price", values.price);
      formData.append("salePrice", values.salePrice); // "" clears it
      formData.append("stock", values.stock || "0");
      formData.append("shortDescription", values.shortDescription.trim());
      formData.append("description", values.description.trim());
      formData.append("isFeatured", String(values.isFeatured));
      formData.append("isCustom", String(values.isCustom));
      formData.append("isKids", String(values.isKids));
      formData.append("isActive", String(values.isActive));
      formData.append("metaTitle", values.metaTitle.trim());
      formData.append("metaKeywords", values.metaKeywords.trim());
      formData.append("metaDescription", values.metaDescription.trim());

      formData.append(
        "variants",
        JSON.stringify(
          variants.map((v) => ({
            ...(v._id ? { _id: v._id } : {}),
            name: v.name.trim(),
            sku: v.sku.trim(),
            price: v.price !== "" ? Number(v.price) : null,
            salePrice: v.salePrice !== "" ? Number(v.salePrice) : null,
            stock: v.stock !== "" ? Number(v.stock) : 0,
            attributes: Object.fromEntries(
              v.attributes
                .filter((a) => a.key && a.value.trim())
                .map((a) => [a.key, a.value.trim()]),
            ),
          })),
        ),
      );

      if (thumbnailFile) formData.append("thumbnail", thumbnailFile);
      for (const f of galleryFiles) formData.append("gallery", f.file as Blob);
      // Existing images that were not removed; the rest are deleted by the API
      if (isEdit)
        formData.append(
          "keepGallery",
          JSON.stringify(existingGallery.map((img) => img.publicId)),
        );

      if (isEdit) {
        if (!id) {
          toast.error("Missing product ID for update.");
          return;
        }
        await updateProduct({ id, formData }).unwrap();
        toast.success("Product updated successfully!");
        navigate("/admin/products");
      } else {
        await createProduct(formData).unwrap();
        toast.success("Product created successfully!");
        if (actionType === "create_another") {
          resetForm();
          return;
        }
        navigate("/admin/products");
      }
    } catch (err: any) {
      toast.error(err?.data?.message || "Operation failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingProduct && isEdit) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">
          Loading product details...
        </span>
      </div>
    );
  }

  const hasVariants = variants.length > 0;

  return (
    <div className="p-6 w-full mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-semibold">
          {isEdit ? "Edit Product" : "Create Product"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isEdit
            ? "Update the product details below."
            : "Fill out the form to add a new product."}
        </p>
      </header>

      <form onSubmit={(e) => handleSubmit(e, "create")} className="space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── LEFT COLUMN ────────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic info */}
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
                <CardDescription>
                  Name, SKU, category and descriptions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="mb-2">
                      Product Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      value={values.name}
                      placeholder="e.g. Elegant Layered Necklace"
                      onChange={(e) => handleChange("name", e.target.value)}
                      className={errors.name ? "border-red-500" : ""}
                    />
                    <FieldError message={errors.name} />
                  </div>

                  <div>
                    <Label className="mb-2">
                      SKU <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      value={values.sku}
                      placeholder="e.g. RW-5M-001"
                      onChange={(e) => handleChange("sku", e.target.value)}
                      className={errors.sku ? "border-red-500" : ""}
                    />
                    <FieldError message={errors.sku} />
                  </div>

                  <div>
                    <Label className="mb-2">HSN code (for GST invoices)</Label>
                    <Input
                      value={values.hsnCode}
                      placeholder="Leave empty to use the store default"
                      inputMode="numeric"
                      maxLength={8}
                      onChange={(e) => handleChange("hsnCode", e.target.value.replace(/\D/g, ""))}
                      className={errors.hsnCode ? "border-red-500" : ""}
                    />
                    <FieldError message={errors.hsnCode} />
                  </div>
                </div>

                <div>
                  <Label className="mb-2">
                    Category <span className="text-red-500">*</span>
                  </Label>
                  <Combobox
                    options={categoryOptions}
                    value={values.categoryId}
                    onChange={(val) => handleChange("categoryId", val)}
                    placeholder="Select a category..."
                    width="100%"
                  />
                  <FieldError message={errors.categoryId} />
                </div>

                <div>
                  <Label className="mb-2">Short Description</Label>
                  <Input
                    value={values.shortDescription}
                    placeholder="One line shown under the product name and on cards"
                    onChange={(e) => handleChange("shortDescription", e.target.value)}
                  />
                </div>

                <div>
                  <Label className="mb-2">Description</Label>
                  <Textarea
                    value={values.description}
                    placeholder="Full product description. Separate paragraphs with a blank line."
                    rows={6}
                    onChange={(e) => handleChange("description", e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Pricing */}
            <Card>
              <CardHeader>
                <CardTitle>Pricing &amp; Stock</CardTitle>
                <CardDescription>
                  Regular price, optional sale price and stock
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label className="mb-2">
                      Price (₹) <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      value={values.price}
                      placeholder="e.g. 599"
                      onChange={(e) => handleChange("price", e.target.value)}
                      className={errors.price ? "border-red-500" : ""}
                    />
                    <FieldError message={errors.price} />
                  </div>

                  <div>
                    <Label className="mb-2">Sale Price (₹)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={values.salePrice}
                      placeholder="e.g. 499"
                      onChange={(e) => handleChange("salePrice", e.target.value)}
                      className={errors.salePrice ? "border-red-500" : ""}
                    />
                    <FieldError message={errors.salePrice} />
                    <p className="text-xs text-muted-foreground mt-1">
                      Leave empty for no discount.
                    </p>
                  </div>

                  <div>
                    <Label className="mb-2">Stock</Label>
                    <Input
                      type="number"
                      min="0"
                      value={values.stock}
                      disabled={hasVariants}
                      onChange={(e) => handleChange("stock", e.target.value)}
                      className={errors.stock ? "border-red-500" : ""}
                    />
                    <FieldError message={errors.stock} />
                    {hasVariants && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Stock is tracked per variant below.
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Variants */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Variants (Optional)</CardTitle>
                    <CardDescription className="mt-1">
                      Options such as size. Each has its own SKU and stock, and
                      can override the price.
                    </CardDescription>
                  </div>
                  <Badge variant="secondary">{variants.length}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {variants.map((variant, index) => (
                  <div
                    key={variant._id ?? `new-${index}`}
                    className="relative border rounded-lg p-4 space-y-4 bg-muted/30"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-muted-foreground">
                        Variant {index + 1}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeVariant(index)}
                        aria-label={`Remove variant ${index + 1}`}
                        className="text-muted-foreground hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label className="mb-1.5 text-xs">
                          Name <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          value={variant.name}
                          placeholder="e.g. 12 mm"
                          className={errors[`variant_${index}_name`] ? "border-red-500" : ""}
                          onChange={(e) => setVariant(index, { name: e.target.value })}
                        />
                        <FieldError message={errors[`variant_${index}_name`]} />
                      </div>

                      <div>
                        <Label className="mb-1.5 text-xs">
                          SKU <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          value={variant.sku}
                          placeholder="e.g. RW-5M-001-12"
                          className={errors[`variant_${index}_sku`] ? "border-red-500" : ""}
                          onChange={(e) => setVariant(index, { sku: e.target.value })}
                        />
                        <FieldError message={errors[`variant_${index}_sku`]} />
                      </div>

                      <div>
                        <Label className="mb-1.5 text-xs">Price (₹)</Label>
                        <Input
                          type="number"
                          min="0"
                          value={variant.price}
                          placeholder="Uses the product price if empty"
                          className={errors[`variant_${index}_price`] ? "border-red-500" : ""}
                          onChange={(e) => setVariant(index, { price: e.target.value })}
                        />
                        <FieldError message={errors[`variant_${index}_price`]} />
                      </div>

                      <div>
                        <Label className="mb-1.5 text-xs">Sale Price (₹)</Label>
                        <Input
                          type="number"
                          min="0"
                          value={variant.salePrice}
                          className={errors[`variant_${index}_salePrice`] ? "border-red-500" : ""}
                          onChange={(e) => setVariant(index, { salePrice: e.target.value })}
                        />
                        <FieldError message={errors[`variant_${index}_salePrice`]} />
                      </div>

                      <div>
                        <Label className="mb-1.5 text-xs">Stock</Label>
                        <Input
                          type="number"
                          min="0"
                          value={variant.stock}
                          className={errors[`variant_${index}_stock`] ? "border-red-500" : ""}
                          onChange={(e) => setVariant(index, { stock: e.target.value })}
                        />
                        <FieldError message={errors[`variant_${index}_stock`]} />
                      </div>
                    </div>

                    {/* Attributes */}
                    <div className="space-y-2">
                      <Label className="text-xs">Attributes</Label>
                      {variant.attributes.map((row, ai) => {
                        const def = attributes.find((a: any) => a.slug === row.key);
                        return (
                          <div key={ai} className="flex items-center gap-2">
                            <Select
                              value={row.key}
                              onValueChange={(key) =>
                                setAttributeRow(index, ai, { key, value: "" })
                              }
                            >
                              <SelectTrigger className="w-44">
                                <SelectValue placeholder="Attribute" />
                              </SelectTrigger>
                              <SelectContent>
                                {attributes.map((a: any) => (
                                  <SelectItem key={a._id} value={a.slug}>
                                    {a.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            {def?.values?.length ? (
                              <Select
                                value={row.value}
                                onValueChange={(value) =>
                                  setAttributeRow(index, ai, { value })
                                }
                              >
                                <SelectTrigger className="flex-1">
                                  <SelectValue placeholder="Value" />
                                </SelectTrigger>
                                <SelectContent>
                                  {def.values.map((val: string) => (
                                    <SelectItem key={val} value={val}>
                                      {val}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                className="flex-1"
                                value={row.value}
                                placeholder="Value"
                                onChange={(e) =>
                                  setAttributeRow(index, ai, { value: e.target.value })
                                }
                              />
                            )}

                            <button
                              type="button"
                              aria-label="Remove attribute"
                              onClick={() =>
                                setVariant(index, {
                                  attributes: variant.attributes.filter((_, j) => j !== ai),
                                })
                              }
                              className="text-muted-foreground hover:text-red-500"
                            >
                              <XIcon className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })}

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={attributes.length === 0}
                        onClick={() =>
                          setVariant(index, {
                            attributes: [...variant.attributes, { key: "", value: "" }],
                          })
                        }
                      >
                        <Plus className="mr-1 h-3 w-3" /> Add attribute
                      </Button>
                      {attributes.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          No attributes defined yet. Create them under
                          Attributes in the sidebar.
                        </p>
                      )}
                    </div>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2"
                  onClick={addVariant}
                >
                  <Plus className="h-4 w-4" /> Add Variant
                </Button>
              </CardContent>
            </Card>

            {/* SEO */}
            <Card>
              <CardHeader>
                <CardTitle>SEO</CardTitle>
                <CardDescription>How this product appears in search results</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <Label className="mb-2">Meta Title</Label>
                  <Input
                    value={values.metaTitle}
                    onChange={(e) => handleChange("metaTitle", e.target.value)}
                  />
                </div>
                <div>
                  <Label className="mb-2">Meta Keywords</Label>
                  <Input
                    value={values.metaKeywords}
                    placeholder="comma, separated, keywords"
                    onChange={(e) => handleChange("metaKeywords", e.target.value)}
                  />
                </div>
                <div>
                  <Label className="mb-2">Meta Description</Label>
                  <Textarea
                    value={values.metaDescription}
                    rows={3}
                    onChange={(e) => handleChange("metaDescription", e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── RIGHT COLUMN ───────────────────────────────────────────── */}
          <div className="space-y-6">
            {/* Status */}
            <Card>
              <CardHeader>
                <CardTitle>Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between border rounded-lg p-3">
                  <div>
                    <Label htmlFor="isActive">Active</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Visible on the storefront
                    </p>
                  </div>
                  <Switch
                    id="isActive"
                    checked={values.isActive}
                    onCheckedChange={(v) => handleChange("isActive", v)}
                  />
                </div>
                <div className="flex items-center justify-between border rounded-lg p-3">
                  <div>
                    <Label htmlFor="isFeatured">Featured</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Show in Featured Products
                    </p>
                  </div>
                  <Switch
                    id="isFeatured"
                    checked={values.isFeatured}
                    onCheckedChange={(v) => handleChange("isFeatured", v)}
                  />
                </div>
                <div className="flex items-center justify-between border rounded-lg p-3">
                  <div>
                    <Label htmlFor="isCustom">Custom product</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Listed on Custom Products; customers message on WhatsApp to order
                    </p>
                  </div>
                  <Switch
                    id="isCustom"
                    checked={values.isCustom}
                    onCheckedChange={(v) => handleChange("isCustom", v)}
                  />
                </div>
                <div className="flex items-center justify-between border rounded-lg p-3">
                  <div>
                    <Label htmlFor="isKids">For kids</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Show in the Kids section of the website
                    </p>
                  </div>
                  <Switch
                    id="isKids"
                    checked={values.isKids}
                    onCheckedChange={(v) => handleChange("isKids", v)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Thumbnail */}
            <Card>
              <CardHeader>
                <CardTitle>Thumbnail</CardTitle>
                <CardDescription>The main image on product cards</CardDescription>
              </CardHeader>
              <CardContent>
                <ImageField
                  key={`thumb-${imagesKey}`}
                  label="Thumbnail"
                  existingUrl={existingThumbnail}
                  onChange={setThumbnailFile}
                  hint="PNG, JPG, WebP. Max 5MB."
                />
              </CardContent>
            </Card>

            {/* Gallery */}
            <Card>
              <CardHeader>
                <CardTitle>Gallery</CardTitle>
                <CardDescription>Up to 8 more images for the product page</CardDescription>
              </CardHeader>
              <CardContent>
                {existingGallery.length > 0 && (
                  <div className="mb-3 grid grid-cols-3 gap-2">
                    {existingGallery.map((img, i) => (
                      <div key={img.publicId} className="relative group">
                        <img
                          src={img.url}
                          alt={`Gallery image ${i + 1}`}
                          className="h-20 w-full object-cover rounded-lg border"
                        />
                        <button
                          type="button"
                          aria-label="Remove image"
                          onClick={() =>
                            setExistingGallery((prev) =>
                              prev.filter((x) => x.publicId !== img.publicId),
                            )
                          }
                          className="absolute top-1 right-1 bg-black/60 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <XIcon className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {galleryFiles.length > 0 && (
                  <div className="mb-3 grid grid-cols-3 gap-2">
                    {galleryFiles.map((f, i) => (
                      <div key={f.id} className="relative group">
                        <img
                          src={f.preview}
                          alt={`New image ${i + 1}`}
                          className="h-20 w-full object-cover rounded-lg border"
                        />
                        <button
                          type="button"
                          aria-label="Remove image"
                          onClick={() => galleryHandlers.removeFile(f.id)}
                          className="absolute top-1 right-1 bg-black/60 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <XIcon className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div
                  onDragEnter={galleryHandlers.handleDragEnter}
                  onDragLeave={galleryHandlers.handleDragLeave}
                  onDragOver={galleryHandlers.handleDragOver}
                  onDrop={galleryHandlers.handleDrop}
                  onClick={galleryHandlers.openFileDialog}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                    galleryDrag
                      ? "border-primary bg-accent"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <input {...galleryHandlers.getInputProps()} className="sr-only" />
                  <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Drag &amp; drop images or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PNG, JPG, WebP — max 5MB each
                  </p>
                </div>
                {galleryErrors.length > 0 && (
                  <p className="text-xs text-red-500 mt-1">{galleryErrors[0]}</p>
                )}
              </CardContent>
            </Card>

            {/* Submit buttons */}
            <div className="space-y-3">
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? "Update Product" : "Create Product"}
              </Button>

              {!isEdit && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={isSubmitting}
                  onClick={(e) => handleSubmit(e as any, "create_another")}
                >
                  Save &amp; Add Another
                </Button>
              )}

              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => navigate("/admin/products")}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
