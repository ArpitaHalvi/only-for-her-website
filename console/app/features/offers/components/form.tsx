// app/features/offers/components/form.tsx
"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import ImageField from "@/components/crud/ImageField";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useNavigate, useParams } from "react-router";
import {
  useCreateOfferMutation,
  useUpdateOfferMutation,
  useGetOfferByIdQuery,
} from "../data/offerApi";

interface Values {
  title: string;
  link: string;
  sortOrder: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
}

const empty = (): Values => ({ title: "", link: "/shop", sortOrder: "0", startsAt: "", endsAt: "", isActive: true });

// <input type="date"> works with yyyy-mm-dd
const toDateInput = (d?: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

// Handy destinations so nobody has to remember the site's addresses
const SUGGESTIONS = [
  { label: "All jewellery", link: "/shop" },
  { label: "New arrivals", link: "/shop/new-arrivals" },
  { label: "Bestsellers", link: "/shop/bestsellers" },
  { label: "Divine collection", link: "/collections/divine" },
  { label: "Festive collection", link: "/collections/festive" },
  { label: "Daily wear", link: "/collections/daily-wear" },
];

export default function OfferForm({ mode = "create" }: { mode?: "create" | "edit" }) {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = mode === "edit" || !!id;

  const { data, isLoading } = useGetOfferByIdQuery(id ?? "", { skip: !isEdit });
  const [createOffer] = useCreateOfferMutation();
  const [updateOffer] = useUpdateOfferMutation();

  const [values, setValues] = useState<Values>(empty());
  const [image, setImage] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const o = data?.data;
    if (!o) return;
    setValues({
      title: o.title,
      link: o.link ?? "",
      sortOrder: String(o.sortOrder ?? 0),
      startsAt: toDateInput(o.startsAt),
      endsAt: toDateInput(o.endsAt),
      isActive: o.isActive,
    });
  }, [data]);

  const set = (k: keyof Values, v: any) => {
    setValues((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((p) => ({ ...p, [k]: "" }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!values.title.trim()) e.title = "Enter a title.";
    if (!/^(\/(?!\/)|https?:\/\/)/i.test(values.link.trim())) e.link = 'Start with "/" for a page on the site, or "https://".';
    if (!isEdit && !image) e.image = "Choose a banner image.";
    if (values.sortOrder !== "" && (!Number.isInteger(Number(values.sortOrder)) || Number(values.sortOrder) < 0))
      e.sortOrder = "Enter a whole number, 0 or more.";
    if (values.startsAt && values.endsAt && values.endsAt < values.startsAt) e.endsAt = "Must be after the start date.";
    return e;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) {
      setErrors(e);
      toast.error("Please correct the highlighted fields.");
      return;
    }

    const formData = new FormData();
    formData.append("title", values.title.trim());
    formData.append("link", values.link.trim());
    formData.append("sortOrder", values.sortOrder || "0");
    formData.append("isActive", String(values.isActive));
    formData.append("startsAt", values.startsAt); // "" clears it
    // shown through the end of the chosen day
    formData.append("endsAt", values.endsAt ? new Date(`${values.endsAt}T23:59:59`).toISOString() : "");
    if (image) formData.append("image", image);

    setIsSubmitting(true);
    try {
      if (isEdit && id) await updateOffer({ id, formData }).unwrap();
      else await createOffer(formData).unwrap();
      toast.success(isEdit ? "Offer updated." : "Offer created.");
      navigate("/admin/offers");
    } catch (err: any) {
      toast.error(err?.data?.message || "Operation failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading && isEdit) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const field = (k: keyof Values) => (errors[k] ? "border-red-500" : "");
  const err = (k: string) => errors[k] && <p className="mt-1 text-xs text-red-500">{errors[k]}</p>;

  return (
    <div className="mx-auto w-full space-y-8 p-6">
      <header>
        <h1 className="text-3xl font-semibold">{isEdit ? "Edit Offer" : "Create Offer"}</h1>
        <p className="text-sm text-muted-foreground">A banner on the home page, just under the hero.</p>
      </header>

      <form onSubmit={submit} className="max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Banner</CardTitle>
            <CardDescription>A wide image works best (about 3 : 1, e.g. 1800 × 600).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ImageField
              label="Banner image *"
              existingUrl={data?.data?.image?.url}
              onChange={(f) => {
                setImage(f);
                if (errors.image) setErrors((p) => ({ ...p, image: "" }));
              }}
              heightClass="h-40"
            />
            {err("image")}
            <div>
              <Label className="mb-2 block">Title <span className="text-red-500">*</span></Label>
              <Input value={values.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Diwali sale: 20% off malas" className={field("title")} />
              <p className="mt-1 text-xs text-muted-foreground">Used as the image description for screen readers.</p>
              {err("title")}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Where it goes</CardTitle>
            <CardDescription>The page a visitor lands on after clicking the banner.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="mb-2 block">Link <span className="text-red-500">*</span></Label>
              <Input value={values.link} onChange={(e) => set("link", e.target.value)} placeholder="/shop" className={field("link")} />
              {err("link")}
            </div>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <Button key={s.link} type="button" size="sm" variant="outline" onClick={() => set("link", s.link)}>
                  {s.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Schedule and order</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-2 block">Show from</Label>
              <Input type="date" value={values.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
            </div>
            <div>
              <Label className="mb-2 block">Show until</Label>
              <Input type="date" value={values.endsAt} onChange={(e) => set("endsAt", e.target.value)} className={field("endsAt")} />
              {err("endsAt")}
            </div>
            <div>
              <Label className="mb-2 block">Display order</Label>
              <Input type="number" min="0" value={values.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} className={field("sortOrder")} />
              <p className="mt-1 text-xs text-muted-foreground">Lower numbers come first.</p>
              {err("sortOrder")}
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3 sm:self-start">
              <div>
                <Label htmlFor="isActive">Active</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">Switch off to hide it without deleting.</p>
              </div>
              <Switch id="isActive" checked={values.isActive} onCheckedChange={(v) => set("isActive", v)} />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Save Changes" : "Create Offer"}
          </Button>
          <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => navigate("/admin/offers")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
