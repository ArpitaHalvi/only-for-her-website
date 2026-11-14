// app/features/product-categories/components/form.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useNavigate, useParams } from "react-router";
import ImageField from "@/components/crud/ImageField";
import {
  useCreateProductCategoryMutation,
  useUpdateProductCategoryMutation,
  useGetProductCategoryByIdQuery,
  useGetProductCategoriesAllQuery,
} from "../data/productCategoryApi";

const NO_PARENT = "none";

interface FormValues {
  name: string;
  parent: string;
  shortDescription: string;
  description: string;
  icon: string;
  sortOrder: string;
  isActive: boolean;
  isFeatured: boolean;
  metaTitle: string;
  metaKeywords: string;
  metaDescription: string;
}

const emptyValues = (): FormValues => ({
  name: "",
  parent: NO_PARENT,
  shortDescription: "",
  description: "",
  icon: "",
  sortOrder: "0",
  isActive: true,
  isFeatured: false,
  metaTitle: "",
  metaKeywords: "",
  metaDescription: "",
});

export default function ProductCategoryForm({
  mode = "create",
}: {
  mode?: "create" | "edit";
}) {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = mode === "edit" || !!id;

  const { data: categoryData, isLoading: loadingCategory } =
    useGetProductCategoryByIdQuery(id, { skip: !isEdit });
  const { data: allCategories } = useGetProductCategoriesAllQuery();
  const [createCategory] = useCreateProductCategoryMutation();
  const [updateCategory] = useUpdateProductCategoryMutation();

  const [values, setValues] = useState<FormValues>(emptyValues());
  const [existing, setExisting] = useState<{ image?: string; banner?: string }>({});
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [formKey, setFormKey] = useState(0); // remounts the image pickers
  const [isSubmitting, setIsSubmitting] = useState(false);

  // A category can't be its own parent (the API also rejects moving it under a child)
  const parentOptions = useMemo(() => {
    const list = Array.isArray(allCategories?.data) ? allCategories.data : [];
    return list.filter((c: any) => c._id !== id);
  }, [allCategories, id]);

  useEffect(() => {
    const c = categoryData?.data;
    if (!c) return;
    setValues({
      name: c.name || "",
      parent: c.parent?._id || c.parent || NO_PARENT,
      shortDescription: c.shortDescription || "",
      description: c.description || "",
      icon: c.icon || "",
      sortOrder: String(c.sortOrder ?? 0),
      isActive: c.isActive ?? true,
      isFeatured: c.isFeatured ?? false,
      metaTitle: c.metaTitle || "",
      metaKeywords: c.metaKeywords || "",
      metaDescription: c.metaDescription || "",
    });
    setExisting({ image: c.image?.url, banner: c.banner?.url });
  }, [categoryData]);

  const handleChange = (name: keyof FormValues, value: any) =>
    setValues((prev) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e: React.FormEvent, actionType = "save") => {
    e.preventDefault();

    if (!values.name.trim()) {
      toast.error("Category name is required.");
      return;
    }
    if (values.sortOrder !== "" && Number(values.sortOrder) < 0) {
      toast.error("Sort order cannot be negative.");
      return;
    }

    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("name", values.name.trim());
    formData.append("parent", values.parent === NO_PARENT ? "" : values.parent);
    formData.append("shortDescription", values.shortDescription);
    formData.append("description", values.description);
    formData.append("icon", values.icon);
    formData.append("sortOrder", values.sortOrder || "0");
    formData.append("isActive", String(values.isActive));
    formData.append("isFeatured", String(values.isFeatured));
    formData.append("metaTitle", values.metaTitle);
    formData.append("metaKeywords", values.metaKeywords);
    formData.append("metaDescription", values.metaDescription);
    if (imageFile) formData.append("image", imageFile);
    if (bannerFile) formData.append("banner", bannerFile);

    try {
      if (isEdit) {
        await updateCategory({ id, formData }).unwrap();
        toast.success("Product category updated successfully!");
      } else {
        await createCategory(formData).unwrap();
        toast.success("Product category created successfully!");
        if (actionType === "create_another") {
          setValues(emptyValues());
          setImageFile(null);
          setBannerFile(null);
          setFormKey((k) => k + 1);
          return;
        }
      }
      navigate("/admin/product-categories");
    } catch (err: any) {
      toast.error(err?.data?.message || "Operation failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingCategory && isEdit) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">
          Loading product category details...
        </span>
      </div>
    );
  }

  return (
    <div className="p-6 w-full mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-semibold">
          {isEdit ? "Edit Product Category" : "Create Product Category"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isEdit
            ? "Update the details of this category."
            : "Add a category to organise your products. Pick a parent to nest it."}
        </p>
      </header>

      <form onSubmit={(e) => handleSubmit(e, "save")} className="space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Category Details</CardTitle>
                <CardDescription>Name, parent and descriptions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="mb-2 block">
                      Category Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      value={values.name}
                      placeholder="e.g. Necklaces"
                      onChange={(e) => handleChange("name", e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <Label className="mb-2 block">Parent Category</Label>
                    <Select
                      value={values.parent}
                      onValueChange={(v) => handleChange("parent", v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="No parent (top level)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_PARENT}>
                          No parent (top level)
                        </SelectItem>
                        {parentOptions.map((c: any) => (
                          <SelectItem key={c._id} value={c._id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="mb-2 block">Short Description</Label>
                  <Input
                    value={values.shortDescription}
                    placeholder="One line shown on category cards and menus"
                    onChange={(e) =>
                      handleChange("shortDescription", e.target.value)
                    }
                  />
                </div>

                <div>
                  <Label className="mb-2 block">Description</Label>
                  <Textarea
                    value={values.description}
                    placeholder="Full description for the category page"
                    rows={5}
                    onChange={(e) => handleChange("description", e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="mb-2 block">Icon</Label>
                    <Input
                      value={values.icon}
                      placeholder="Icon path or class name (optional)"
                      onChange={(e) => handleChange("icon", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="mb-2 block">Sort Order</Label>
                    <Input
                      type="number"
                      min="0"
                      value={values.sortOrder}
                      onChange={(e) => handleChange("sortOrder", e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Lower numbers appear first.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>SEO</CardTitle>
                <CardDescription>
                  How this category appears in search results
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <Label className="mb-2 block">Meta Title</Label>
                  <Input
                    value={values.metaTitle}
                    onChange={(e) => handleChange("metaTitle", e.target.value)}
                  />
                </div>
                <div>
                  <Label className="mb-2 block">Meta Keywords</Label>
                  <Input
                    value={values.metaKeywords}
                    placeholder="comma, separated, keywords"
                    onChange={(e) => handleChange("metaKeywords", e.target.value)}
                  />
                </div>
                <div>
                  <Label className="mb-2 block">Meta Description</Label>
                  <Textarea
                    value={values.metaDescription}
                    rows={3}
                    onChange={(e) =>
                      handleChange("metaDescription", e.target.value)
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* RIGHT */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Visibility</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between border rounded-lg p-3">
                  <div>
                    <Label htmlFor="isActive" className="cursor-pointer">
                      Active
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Shown on the storefront
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
                    <Label htmlFor="isFeatured" className="cursor-pointer">
                      Featured
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Highlight on the home page
                    </p>
                  </div>
                  <Switch
                    id="isFeatured"
                    checked={values.isFeatured}
                    onCheckedChange={(v) => handleChange("isFeatured", v)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Images</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <ImageField
                  key={`image-${formKey}`}
                  label="Cover Image"
                  existingUrl={existing.image}
                  onChange={setImageFile}
                  hint="Used on category cards. Max 5MB."
                />
                <ImageField
                  key={`banner-${formKey}`}
                  label="Banner"
                  existingUrl={existing.banner}
                  onChange={setBannerFile}
                  heightClass="h-28"
                  hint="Wide image for the top of the category page."
                />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* CONTROLS */}
        <div className="flex gap-3 pt-4 border-t">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Save Changes" : "Create"}
          </Button>
          {!isEdit && (
            <Button
              variant="outline"
              type="button"
              disabled={isSubmitting}
              onClick={(e) => handleSubmit(e, "create_another")}
            >
              Create & Add Another
            </Button>
          )}
          <Button
            variant="outline"
            type="button"
            disabled={isSubmitting}
            onClick={() => navigate("/admin/product-categories")}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
