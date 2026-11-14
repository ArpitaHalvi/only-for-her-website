// app/features/product-attributes/components/form.tsx
"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useNavigate, useParams } from "react-router";
import TagsInput from "@/components/crud/TagsInput";
import {
  useCreateProductAttributeMutation,
  useUpdateProductAttributeMutation,
  useGetProductAttributeByIdQuery,
} from "../data/productAttributeApi";

export default function ProductAttributeForm({
  mode = "create",
}: {
  mode?: "create" | "edit";
}) {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = mode === "edit" || !!id;

  const { data, isLoading: loading } = useGetProductAttributeByIdQuery(id ?? "", {
    skip: !isEdit,
  });
  const [createAttribute] = useCreateProductAttributeMutation();
  const [updateAttribute] = useUpdateProductAttributeMutation();

  const [name, setName] = useState("");
  const [values, setValues] = useState<string[]>([]);
  const [slug, setSlug] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const a = data?.data;
    if (!a) return;
    setName(a.name || "");
    setValues(a.values || []);
    setSlug(a.slug || "");
  }, [data]);

  const handleSubmit = async (e: React.FormEvent, actionType = "save") => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Attribute name is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEdit && id) {
        await updateAttribute({ id, data: { name: name.trim(), values } }).unwrap();
        toast.success("Attribute updated successfully!");
      } else {
        await createAttribute({ name: name.trim(), values }).unwrap();
        toast.success("Attribute created successfully!");
        if (actionType === "create_another") {
          setName("");
          setValues([]);
          return;
        }
      }
      navigate("/admin/product-attributes");
    } catch (err: any) {
      toast.error(err?.data?.message || "Operation failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading && isEdit) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading attribute...</span>
      </div>
    );
  }

  return (
    <div className="p-6 w-full mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-semibold">
          {isEdit ? "Edit Attribute" : "Create Attribute"}
        </h1>
        <p className="text-sm text-muted-foreground">
          An attribute is an option variants can choose from, like Size or Grade.
        </p>
      </header>

      <form onSubmit={(e) => handleSubmit(e, "save")} className="space-y-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Attribute</CardTitle>
            <CardDescription>
              Name it and list the values a variant may use.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Label className="mb-2 block">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                value={name}
                placeholder="e.g. Size"
                onChange={(e) => setName(e.target.value)}
                required
              />
              {isEdit && slug && (
                <p className="text-xs text-muted-foreground mt-1">
                  Key used on variants: <code>{slug}</code> (it does not change
                  when you rename the attribute).
                </p>
              )}
            </div>

            <div>
              <Label className="mb-2 block">Allowed values</Label>
              <TagsInput value={values} onChange={setValues} />
              <p className="text-xs text-muted-foreground mt-1">
                Type a value and press Enter, e.g. 8mm, 10mm, 12mm. Leave empty
                to allow any value.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
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
              Create &amp; Add Another
            </Button>
          )}
          <Button
            variant="outline"
            type="button"
            disabled={isSubmitting}
            onClick={() => navigate("/admin/product-attributes")}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
