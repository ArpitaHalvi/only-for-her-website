// app/features/coupons/components/form.tsx
"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useNavigate, useParams } from "react-router";
import {
  useCreateCouponMutation,
  useUpdateCouponMutation,
  useGetCouponByIdQuery,
} from "../data/couponApi";

interface Values {
  code: string;
  description: string;
  type: "percent" | "fixed";
  value: string;
  maxDiscount: string;
  minOrderAmount: string;
  startsAt: string;
  expiresAt: string;
  usageLimit: string;
  perCustomerLimit: string;
  isActive: boolean;
}

const empty = (): Values => ({
  code: "",
  description: "",
  type: "percent",
  value: "",
  maxDiscount: "",
  minOrderAmount: "",
  startsAt: "",
  expiresAt: "",
  usageLimit: "",
  perCustomerLimit: "",
  isActive: true,
});

// <input type="date"> works with yyyy-mm-dd
const toDateInput = (d?: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const num = (v: string) => (v.trim() === "" ? null : Number(v));

export default function CouponForm({ mode = "create" }: { mode?: "create" | "edit" }) {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = mode === "edit" || !!id;

  const { data, isLoading } = useGetCouponByIdQuery(id ?? "", { skip: !isEdit });
  const [createCoupon] = useCreateCouponMutation();
  const [updateCoupon] = useUpdateCouponMutation();

  const [values, setValues] = useState<Values>(empty());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const c = data?.data;
    if (!c) return;
    setValues({
      code: c.code,
      description: c.description ?? "",
      type: c.type,
      value: String(c.value),
      maxDiscount: c.maxDiscount != null ? String(c.maxDiscount) : "",
      minOrderAmount: c.minOrderAmount ? String(c.minOrderAmount) : "",
      startsAt: toDateInput(c.startsAt),
      expiresAt: toDateInput(c.expiresAt),
      usageLimit: c.usageLimit != null ? String(c.usageLimit) : "",
      perCustomerLimit: c.perCustomerLimit != null ? String(c.perCustomerLimit) : "",
      isActive: c.isActive,
    });
  }, [data]);

  const set = (k: keyof Values, v: any) => {
    setValues((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((p) => ({ ...p, [k]: "" }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!/^[A-Za-z0-9_-]{3,30}$/.test(values.code.trim())) e.code = "3 to 30 letters, numbers, - or _.";
    const v = Number(values.value);
    if (values.value === "" || isNaN(v) || v <= 0) e.value = "Enter a discount above 0.";
    else if (values.type === "percent" && v > 100) e.value = "A percentage cannot be above 100.";
    for (const k of ["maxDiscount", "minOrderAmount"] as const)
      if (values[k] !== "" && (isNaN(Number(values[k])) || Number(values[k]) < 0)) e[k] = "Enter 0 or more.";
    for (const k of ["usageLimit", "perCustomerLimit"] as const)
      if (values[k] !== "" && (!Number.isInteger(Number(values[k])) || Number(values[k]) < 1)) e[k] = "Enter a whole number, 1 or more.";
    if (values.startsAt && values.expiresAt && values.expiresAt < values.startsAt) e.expiresAt = "Must be after the start date.";
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
    const payload = {
      code: values.code.trim().toUpperCase(),
      description: values.description.trim(),
      type: values.type,
      value: Number(values.value),
      maxDiscount: values.type === "percent" ? num(values.maxDiscount) : null,
      minOrderAmount: num(values.minOrderAmount) ?? 0,
      startsAt: values.startsAt || null,
      // valid through the end of the chosen day
      expiresAt: values.expiresAt ? new Date(`${values.expiresAt}T23:59:59`).toISOString() : null,
      usageLimit: num(values.usageLimit),
      perCustomerLimit: num(values.perCustomerLimit),
      isActive: values.isActive,
    };

    setIsSubmitting(true);
    try {
      if (isEdit && id) await updateCoupon({ id, data: payload }).unwrap();
      else await createCoupon(payload).unwrap();
      toast.success(isEdit ? "Coupon updated." : "Coupon created.");
      navigate("/admin/coupons");
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
  const err = (k: keyof Values) => errors[k] && <p className="mt-1 text-xs text-red-500">{errors[k]}</p>;

  return (
    <div className="mx-auto w-full space-y-8 p-6">
      <header>
        <h1 className="text-3xl font-semibold">{isEdit ? "Edit Coupon" : "Create Coupon"}</h1>
        <p className="text-sm text-muted-foreground">Customers type the code at checkout.</p>
      </header>

      <form onSubmit={submit} className="max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Discount</CardTitle>
            <CardDescription>The code and how much it takes off.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-2 block">Code <span className="text-red-500">*</span></Label>
              <Input
                value={values.code}
                onChange={(e) => set("code", e.target.value.toUpperCase())}
                placeholder="e.g. WELCOME10"
                disabled={isEdit && (data?.data?.usedCount ?? 0) > 0}
                className={field("code")}
              />
              {err("code")}
            </div>
            <div>
              <Label className="mb-2 block">Description</Label>
              <Input value={values.description} onChange={(e) => set("description", e.target.value)} placeholder="Shown to you only" />
            </div>

            <div>
              <Label className="mb-2 block">Type</Label>
              <select
                value={values.type}
                onChange={(e) => set("type", e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="percent">Percentage off</option>
                <option value="fixed">Fixed amount off (₹)</option>
              </select>
            </div>
            <div>
              <Label className="mb-2 block">
                {values.type === "percent" ? "Percentage" : "Amount (₹)"} <span className="text-red-500">*</span>
              </Label>
              <Input type="number" min="0" value={values.value} onChange={(e) => set("value", e.target.value)} className={field("value")} />
              {err("value")}
            </div>

            {values.type === "percent" && (
              <div>
                <Label className="mb-2 block">Maximum discount (₹)</Label>
                <Input type="number" min="0" value={values.maxDiscount} onChange={(e) => set("maxDiscount", e.target.value)} placeholder="No cap" className={field("maxDiscount")} />
                {err("maxDiscount")}
              </div>
            )}
            <div>
              <Label className="mb-2 block">Minimum order (₹)</Label>
              <Input type="number" min="0" value={values.minOrderAmount} onChange={(e) => set("minOrderAmount", e.target.value)} placeholder="None" className={field("minOrderAmount")} />
              {err("minOrderAmount")}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Validity and limits</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-2 block">Starts on</Label>
              <Input type="date" value={values.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
            </div>
            <div>
              <Label className="mb-2 block">Expires on</Label>
              <Input type="date" value={values.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} className={field("expiresAt")} />
              {err("expiresAt")}
            </div>
            <div>
              <Label className="mb-2 block">Total uses allowed</Label>
              <Input type="number" min="1" value={values.usageLimit} onChange={(e) => set("usageLimit", e.target.value)} placeholder="Unlimited" className={field("usageLimit")} />
              {err("usageLimit")}
            </div>
            <div>
              <Label className="mb-2 block">Uses per customer</Label>
              <Input type="number" min="1" value={values.perCustomerLimit} onChange={(e) => set("perCustomerLimit", e.target.value)} placeholder="Unlimited" className={field("perCustomerLimit")} />
              {err("perCustomerLimit")}
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3 sm:col-span-2">
              <div>
                <Label htmlFor="isActive">Active</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">Switch off to stop the code working without deleting it.</p>
              </div>
              <Switch id="isActive" checked={values.isActive} onCheckedChange={(v) => set("isActive", v)} />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Save Changes" : "Create Coupon"}
          </Button>
          <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => navigate("/admin/coupons")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
