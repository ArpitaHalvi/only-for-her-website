// app/features/app-configuration/components/form.tsx

"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { INDIAN_STATES } from "@/lib/indianStates";
import { useNavigate } from "react-router";
import {
  useGetAppConfigurationQuery,
  useUpdateAppConfigurationMutation,
} from "../data/appConfigurationApi";
import { Loader2, Plus, Trash2, Settings } from "lucide-react";

/* -------------------------------------------------------------------------- */
/* 🧱 Types */
/* -------------------------------------------------------------------------- */
type CompanyAddress = {
  address: string;
  googleMapLocation: string;
};

type VideoLink = {
  title: string;
  url: string;
};

type AppConfigValues = {
  appName: string;
  email: string;
  phoneNumber: string;
  companyAddress: CompanyAddress[];
  videos: VideoLink[];
  facebookLink: string;
  instagramLink: string;
  twitterLink: string;
  youtubeLink: string;
  whatsAppLink: string;
  googleFormLink: string;
  linkedinLink: string;
  googleAppStoreLink: string;
  appleAppStoreLink: string;
  // Store settings used at checkout
  taxMode: "inclusive" | "exclusive";
  taxRate: string;
  gstRegistered: boolean;
  gstin: string;
  legalName: string;
  businessAddress: string;
  businessState: string;
  invoicePrefix: string;
  defaultHsn: string;
  invoiceNote: string;
  shippingCharge: string;
  freeShippingAbove: string;
  // Cash on delivery and parcel tracking
  codEnabled: boolean;
  codCharge: string;
  codMaxAmount: string;
  trackingUrlTemplate: string;
};

/* -------------------------------------------------------------------------- */
/* 🧩 Validation Helper */
/* -------------------------------------------------------------------------- */
const validate = (values: AppConfigValues) => {
  const errors: Record<string, string> = {};
  if (!values.appName.trim()) errors.appName = "App name is required.";
  if (!values.email.trim()) errors.email = "Email is required.";
  if (!values.phoneNumber.trim())
    errors.phoneNumber = "Phone number is required.";
  const money = (v: string) => v === "" || (!isNaN(Number(v)) && Number(v) >= 0);
  if (!money(values.taxRate) || Number(values.taxRate) > 100)
    errors.taxRate = "Enter a rate from 0 to 100.";
  if (values.gstRegistered && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(values.gstin.trim().toUpperCase()))
    errors.gstin = "Enter the 15-character GSTIN, like 27AAAAA0000A1Z5.";
  if (values.gstRegistered && !values.businessState) errors.businessState = "Choose the state you are registered in.";
  if (values.defaultHsn.trim() && !/^[0-9]{4,8}$/.test(values.defaultHsn.trim())) errors.defaultHsn = "HSN code must be 4 to 8 digits.";
  if (!/^[A-Za-z0-9-]{1,10}$/.test(values.invoicePrefix.trim())) errors.invoicePrefix = "Up to 10 letters, digits or dashes.";
  if (!money(values.shippingCharge)) errors.shippingCharge = "Enter 0 or more.";
  if (!money(values.freeShippingAbove)) errors.freeShippingAbove = "Enter 0 or more, or leave empty.";
  if (!money(values.codCharge)) errors.codCharge = "Enter 0 or more.";
  if (!money(values.codMaxAmount)) errors.codMaxAmount = "Enter 0 or more, or leave empty.";
  const template = values.trackingUrlTemplate.trim();
  if (template && (!/^https?:\/\//i.test(template) || !template.includes("{trackingNumber}")))
    errors.trackingUrlTemplate = "Start with https:// and include {trackingNumber} where the number goes.";
  return errors;
};

/* -------------------------------------------------------------------------- */
/* 🧾 App Configuration Form */
/* -------------------------------------------------------------------------- */
export default function AppConfigurationForm({
  mode = "edit",
}: {
  mode?: "create" | "edit";
}) {
  const navigate = useNavigate();
  const { data, isLoading } = useGetAppConfigurationQuery();
  const [updateAppConfiguration] = useUpdateAppConfigurationMutation();

  // ✅ State
  const [values, setValues] = useState<AppConfigValues>({
    appName: "",
    email: "",
    phoneNumber: "",
    companyAddress: [{ address: "", googleMapLocation: "" }],
    videos: [],
    facebookLink: "",
    instagramLink: "",
    twitterLink: "",
    youtubeLink: "",
    whatsAppLink: "",
    googleFormLink: "",
    linkedinLink: "",
    googleAppStoreLink: "",
    appleAppStoreLink: "",
    taxMode: "inclusive",
    taxRate: "0",
    gstRegistered: false,
    gstin: "",
    legalName: "",
    businessAddress: "",
    businessState: "",
    invoicePrefix: "RW",
    defaultHsn: "",
    invoiceNote: "",
    shippingCharge: "0",
    freeShippingAbove: "",
    codEnabled: true,
    codCharge: "0",
    codMaxAmount: "",
    trackingUrlTemplate: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ✅ Prefill Data
  useEffect(() => {
    if (!data?.app_config_data) return;

    // ✅ HARD CLONE to remove RTK freeze completely
    const cleanData = JSON.parse(JSON.stringify(data.app_config_data));

    setValues({
      appName: cleanData.appName || "",
      email: cleanData.email || "",
      phoneNumber: cleanData.phoneNumber || "",
      companyAddress:
        cleanData.companyAddress?.length > 0
          ? cleanData.companyAddress
          : [{ address: "", googleMapLocation: "" }],
      videos: (cleanData.videos || []).map((v: any) => ({ title: v.title || "", url: v.url || "" })),
      facebookLink: cleanData.facebookLink || "",
      instagramLink: cleanData.instagramLink || "",
      twitterLink: cleanData.twitterLink || "",
      youtubeLink: cleanData.youtubeLink || "",
      whatsAppLink: cleanData.whatsAppLink || "",
      googleFormLink: cleanData.googleFormLink || "",
      linkedinLink: cleanData.linkedinLink || "",
      googleAppStoreLink: cleanData.googleAppStoreLink || "",
      appleAppStoreLink: cleanData.appleAppStoreLink || "",
      taxMode: cleanData.taxMode === "exclusive" ? "exclusive" : "inclusive",
      taxRate: String(cleanData.taxRate ?? 0),
      gstRegistered: Boolean(cleanData.gstRegistered),
      gstin: cleanData.gstin || "",
      legalName: cleanData.legalName || "",
      businessAddress: cleanData.businessAddress || "",
      businessState: cleanData.businessState || "",
      invoicePrefix: cleanData.invoicePrefix || "RW",
      defaultHsn: cleanData.defaultHsn || "",
      invoiceNote: cleanData.invoiceNote || "",
      shippingCharge: String(cleanData.shippingCharge ?? 0),
      freeShippingAbove:
        cleanData.freeShippingAbove === null || cleanData.freeShippingAbove === undefined
          ? ""
          : String(cleanData.freeShippingAbove),
      codEnabled: cleanData.codEnabled !== false,
      codCharge: String(cleanData.codCharge ?? 0),
      codMaxAmount:
        cleanData.codMaxAmount === null || cleanData.codMaxAmount === undefined ? "" : String(cleanData.codMaxAmount),
      trackingUrlTemplate: cleanData.trackingUrlTemplate || "",
    });
  }, [data]);

  /* --------------------------------- Handlers -------------------------------- */
  const handleChange = (name: keyof AppConfigValues, value: any) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleAddressChange = (
    index: number,
    field: keyof CompanyAddress,
    value: string,
  ) => {
    setValues((prev) => ({
      ...prev,
      companyAddress: prev.companyAddress.map((addr, i) =>
        i === index ? { ...addr, [field]: value } : addr,
      ),
    }));
  };

  const addAddress = () =>
    setValues((prev) => ({
      ...prev,
      companyAddress: [
        ...prev.companyAddress,
        { address: "", googleMapLocation: "" },
      ],
    }));

  const removeAddress = (index: number) => {
    const updated = values.companyAddress.filter((_, i) => i !== index);
    setValues((prev) => ({ ...prev, companyAddress: updated }));
  };

  const handleVideoChange = (index: number, field: keyof VideoLink, value: string) =>
    setValues((prev) => ({
      ...prev,
      videos: prev.videos.map((v, i) => (i === index ? { ...v, [field]: value } : v)),
    }));

  const addVideo = () =>
    setValues((prev) => ({ ...prev, videos: [...prev.videos, { title: "", url: "" }] }));

  const removeVideo = (index: number) =>
    setValues((prev) => ({ ...prev, videos: prev.videos.filter((_, i) => i !== index) }));

  /* -------------------------------- Submission ------------------------------- */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors = validate(values);
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast.error("Please correct highlighted errors.");
      return;
    }

    setIsSubmitting(true);
    try {
      await updateAppConfiguration({
        ...values,
        // rows left empty are dropped
        videos: values.videos
          .map((v) => ({ title: v.title.trim(), url: v.url.trim() }))
          .filter((v) => v.url),
        taxRate: Number(values.taxRate || 0),
        gstin: values.gstin.trim().toUpperCase(),
        invoicePrefix: values.invoicePrefix.trim().toUpperCase() || "RW",
        shippingCharge: Number(values.shippingCharge || 0),
        freeShippingAbove: values.freeShippingAbove === "" ? null : Number(values.freeShippingAbove),
        codCharge: Number(values.codCharge || 0),
        codMaxAmount: values.codMaxAmount === "" ? null : Number(values.codMaxAmount),
        trackingUrlTemplate: values.trackingUrlTemplate.trim(),
      }).unwrap();
      toast.success("✅ App configuration updated successfully!");
      navigate("/admin/app-configuration");
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to update configuration.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-muted-foreground animate-fadeIn">
        <Loader2 className="h-6 w-6 animate-spin mb-3 text-primary" />
        <p>Loading app configuration...</p>
      </div>
    );
  }

  /* -------------------------------------------------------------------------- */
  /* 🧱 Responsive UI Layout */
  /* -------------------------------------------------------------------------- */
  return (
    <motion.div
      className="p-4 sm:p-6 md:p-8 lg:p-10 space-y-8 max-w-7xl mx-auto w-full"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" />
            App Configuration
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage your app’s general details, address, and social links.
          </p>
        </div>
      </header>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-10">
        {/* BASIC INFO */}
        <Card className="backdrop-blur-lg border border-border shadow-sm hover:shadow-lg transition-all duration-300">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg font-semibold">
              Basic Information
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {[
              {
                label: "App Name",
                key: "appName",
                type: "text",
                placeholder: "Enter app name",
              },
              {
                label: "Email",
                key: "email",
                type: "email",
                placeholder: "Enter email address",
              },
              {
                label: "Phone Number",
                key: "phoneNumber",
                type: "text",
                placeholder: "Enter phone number",
              },
            ].map((field) => (
              <div key={field.key} className="flex flex-col">
                <Label className="mb-2 text-sm font-medium text-muted-foreground">
                  {field.label}
                </Label>
                <Input
                  type={field.type}
                  value={(values as any)[field.key]}
                  onChange={(e) =>
                    handleChange(
                      field.key as keyof AppConfigValues,
                      e.target.value,
                    )
                  }
                  placeholder={field.placeholder}
                  className={`transition-all focus:ring-2 focus:ring-primary/30 ${
                    errors[field.key] ? "border-red-500" : ""
                  }`}
                />
                {errors[field.key] && (
                  <p className="text-xs text-red-500 mt-1">
                    {errors[field.key]}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* COMPANY ADDRESS */}
        <Card className="bg-linear-to-b from-background to-muted/40 border border-border shadow-sm hover:shadow-lg transition-all duration-300">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg font-semibold">
              Company Address
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {values.companyAddress.map((addr, index) => {
              // console.log("isFrozen addr:", Object.isFrozen(addr));
              return (
                <motion.div
                  key={index}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 border rounded-xl p-4 relative bg-card/50"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div>
                    <Label className="mb-2 text-sm font-medium">Address</Label>
                    <Textarea
                      value={addr.address}
                      onChange={(e) =>
                        handleAddressChange(index, "address", e.target.value)
                      }
                      placeholder="Enter company address"
                      className="resize-none"
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label className="mb-2 text-sm font-medium">
                      Google Map Link
                    </Label>
                    <Input
                      value={addr.googleMapLocation}
                      onChange={(e) =>
                        handleAddressChange(
                          index,
                          "googleMapLocation",
                          e.target.value,
                        )
                      }
                      placeholder="https://maps.google.com/..."
                    />
                  </div>
                  {values.companyAddress.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute top-3 right-3 text-destructive hover:bg-destructive/10"
                      onClick={() => removeAddress(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </motion.div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              onClick={addAddress}
              className="flex items-center gap-2 hover:bg-primary/10"
            >
              <Plus className="h-4 w-4" /> Add Another Address
            </Button>
          </CardContent>
        </Card>

        {/* YOUTUBE VIDEOS (home page "Watch & learn") */}
        <Card className="bg-card border border-border shadow-sm hover:shadow-lg transition-all duration-300">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg font-semibold">
              YouTube Videos
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Shown in the &ldquo;Watch &amp; learn&rdquo; section of the website. Paste any YouTube link.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {values.videos.map((video, index) => (
              <div key={index} className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-3 items-end">
                <div>
                  <Label className="mb-2 text-sm font-medium">Title</Label>
                  <Input
                    value={video.title}
                    onChange={(e) => handleVideoChange(index, "title", e.target.value)}
                    placeholder="e.g. How to style a layered necklace"
                  />
                </div>
                <div>
                  <Label className="mb-2 text-sm font-medium">YouTube link</Label>
                  <Input
                    value={video.url}
                    onChange={(e) => handleVideoChange(index, "url", e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => removeVideo(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={addVideo} className="flex items-center gap-2 hover:bg-primary/10">
              <Plus className="h-4 w-4" /> Add Video
            </Button>
          </CardContent>
        </Card>

        {/* SOCIAL LINKS */}
        <Card className="bg-card border border-border shadow-sm hover:shadow-lg transition-all duration-300">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg font-semibold">
              Social & External Links
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {(
              [
                "facebookLink",
                "instagramLink",
                "twitterLink",
                "youtubeLink",
                "linkedinLink",
                "whatsAppLink",
                "googleFormLink",
                "googleAppStoreLink",
                "appleAppStoreLink",
              ] as (keyof AppConfigValues)[]
            ).map((field) => (
              <div key={field}>
                <Label className="text-sm mb-2 block">
                  {field.replace(/([A-Z])/g, " $1")}
                </Label>
                <Input
                  value={String(values[field] ?? "")}
                  onChange={(e) => handleChange(field, e.target.value)}
                  placeholder={`Enter ${field.replace(/([A-Z])/g, " $1")}`}
                  className="focus:ring-2 focus:ring-primary/30 transition-all"
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* STORE SETTINGS (used at checkout) */}
        <Card className="bg-card border border-border shadow-sm hover:shadow-lg transition-all duration-300">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg font-semibold">
              Tax & Shipping
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Used when a customer checks out. Orders keep the values that applied when they were placed.
            </p>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <Label className="text-sm mb-2 block">Prices are</Label>
              <select
                value={values.taxMode}
                onChange={(e) => handleChange("taxMode", e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="inclusive">Tax inclusive (the price already contains tax)</option>
                <option value="exclusive">Tax exclusive (tax is added at checkout)</option>
              </select>
            </div>
            <div>
              <Label className="text-sm mb-2 block">Tax rate (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={values.taxRate}
                onChange={(e) => handleChange("taxRate", e.target.value)}
                className={errors.taxRate ? "border-red-500" : ""}
              />
              <p className="text-xs text-muted-foreground mt-1">0 means no tax line on orders.</p>
              {errors.taxRate && <p className="text-xs text-red-500 mt-1">{errors.taxRate}</p>}
            </div>
            <div>
              <Label className="text-sm mb-2 block">Shipping charge (₹)</Label>
              <Input
                type="number"
                min="0"
                value={values.shippingCharge}
                onChange={(e) => handleChange("shippingCharge", e.target.value)}
                className={errors.shippingCharge ? "border-red-500" : ""}
              />
              <p className="text-xs text-muted-foreground mt-1">0 means free shipping.</p>
              {errors.shippingCharge && <p className="text-xs text-red-500 mt-1">{errors.shippingCharge}</p>}
            </div>
            <div>
              <Label className="text-sm mb-2 block">Free shipping above (₹)</Label>
              <Input
                type="number"
                min="0"
                placeholder="Leave empty for no free-shipping rule"
                value={values.freeShippingAbove}
                onChange={(e) => handleChange("freeShippingAbove", e.target.value)}
                className={errors.freeShippingAbove ? "border-red-500" : ""}
              />
              {errors.freeShippingAbove && <p className="text-xs text-red-500 mt-1">{errors.freeShippingAbove}</p>}
            </div>
          </CardContent>
        </Card>

        {/* GST & INVOICES */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">GST &amp; invoices</CardTitle>
            <p className="text-xs text-muted-foreground">
              Invoices are created automatically when an order ships and can be downloaded by the customer. If you are
              not GST-registered, leave the box off: invoices become a &quot;Bill of Supply&quot; with no tax shown (and the
              tax rate above should be 0).
            </p>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={values.gstRegistered}
                  onChange={(e) => handleChange("gstRegistered", e.target.checked)}
                  className="h-4 w-4"
                />
                We are registered for GST (issue Tax Invoices)
              </label>
            </div>
            <div>
              <Label className="text-sm mb-2 block">Legal business name</Label>
              <Input
                value={values.legalName}
                placeholder="As registered, e.g. Only For Her Jewellery"
                onChange={(e) => handleChange("legalName", e.target.value)}
              />
            </div>
            <div>
              <Label className="text-sm mb-2 block">GSTIN</Label>
              <Input
                value={values.gstin}
                disabled={!values.gstRegistered}
                maxLength={15}
                placeholder="27AAAAA0000A1Z5"
                onChange={(e) => handleChange("gstin", e.target.value.toUpperCase())}
                className={errors.gstin ? "border-red-500" : ""}
              />
              {errors.gstin && <p className="text-xs text-red-500 mt-1">{errors.gstin}</p>}
            </div>
            <div className="sm:col-span-2">
              <Label className="text-sm mb-2 block">Registered address</Label>
              <Input
                value={values.businessAddress}
                placeholder="Printed at the top of every invoice (defaults to the company address above)"
                onChange={(e) => handleChange("businessAddress", e.target.value)}
              />
            </div>
            <div>
              <Label className="text-sm mb-2 block">State you are registered in</Label>
              <select
                value={values.businessState}
                onChange={(e) => handleChange("businessState", e.target.value)}
                className={`h-9 w-full rounded-md border bg-background px-3 text-sm ${errors.businessState ? "border-red-500" : "border-input"}`}
              >
                <option value="">Select a state</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Customers in this state are charged CGST + SGST; everyone else IGST.
              </p>
              {errors.businessState && <p className="text-xs text-red-500 mt-1">{errors.businessState}</p>}
            </div>
            <div>
              <Label className="text-sm mb-2 block">Default HSN code</Label>
              <Input
                value={values.defaultHsn}
                inputMode="numeric"
                maxLength={8}
                placeholder="Used when a product has no HSN of its own"
                onChange={(e) => handleChange("defaultHsn", e.target.value.replace(/\D/g, ""))}
                className={errors.defaultHsn ? "border-red-500" : ""}
              />
              {errors.defaultHsn && <p className="text-xs text-red-500 mt-1">{errors.defaultHsn}</p>}
            </div>
            <div>
              <Label className="text-sm mb-2 block">Invoice number prefix</Label>
              <Input
                value={values.invoicePrefix}
                maxLength={10}
                onChange={(e) => handleChange("invoicePrefix", e.target.value.toUpperCase())}
                className={errors.invoicePrefix ? "border-red-500" : ""}
              />
              <p className="text-xs text-muted-foreground mt-1">Numbers look like RW/2026-27/0001 and restart every April.</p>
              {errors.invoicePrefix && <p className="text-xs text-red-500 mt-1">{errors.invoicePrefix}</p>}
            </div>
            <div>
              <Label className="text-sm mb-2 block">Note at the bottom of invoices</Label>
              <Input
                value={values.invoiceNote}
                placeholder="e.g. Thank you for shopping with us."
                maxLength={600}
                onChange={(e) => handleChange("invoiceNote", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* CASH ON DELIVERY & TRACKING */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Cash on delivery &amp; tracking</CardTitle>
            <p className="text-xs text-muted-foreground">
              Customers can always pay online. These settings control the cash on delivery option and the
              tracking link they see once an order ships.
            </p>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={values.codEnabled}
                  onChange={(e) => handleChange("codEnabled", e.target.checked)}
                  className="h-4 w-4"
                />
                Offer cash on delivery at checkout
              </label>
            </div>
            <div>
              <Label className="text-sm mb-2 block">Cash on delivery fee (₹)</Label>
              <Input
                type="number"
                min="0"
                value={values.codCharge}
                disabled={!values.codEnabled}
                onChange={(e) => handleChange("codCharge", e.target.value)}
                className={errors.codCharge ? "border-red-500" : ""}
              />
              <p className="text-xs text-muted-foreground mt-1">Added to the total for these orders. 0 means no fee.</p>
              {errors.codCharge && <p className="text-xs text-red-500 mt-1">{errors.codCharge}</p>}
            </div>
            <div>
              <Label className="text-sm mb-2 block">Cash on delivery only up to (₹)</Label>
              <Input
                type="number"
                min="0"
                placeholder="Leave empty for no limit"
                value={values.codMaxAmount}
                disabled={!values.codEnabled}
                onChange={(e) => handleChange("codMaxAmount", e.target.value)}
                className={errors.codMaxAmount ? "border-red-500" : ""}
              />
              <p className="text-xs text-muted-foreground mt-1">Larger orders must be paid online.</p>
              {errors.codMaxAmount && <p className="text-xs text-red-500 mt-1">{errors.codMaxAmount}</p>}
            </div>
            <div className="sm:col-span-2">
              <Label className="text-sm mb-2 block">Tracking link</Label>
              <Input
                placeholder="https://www.example-courier.com/track/{trackingNumber}"
                value={values.trackingUrlTemplate}
                onChange={(e) => handleChange("trackingUrlTemplate", e.target.value)}
                className={errors.trackingUrlTemplate ? "border-red-500" : ""}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Your courier's tracking page, with {"{trackingNumber}"} where the number goes. Used when you ship an
                order with a tracking number; you can still paste a different link on a single order.
              </p>
              {errors.trackingUrlTemplate && <p className="text-xs text-red-500 mt-1">{errors.trackingUrlTemplate}</p>}
            </div>
          </CardContent>
        </Card>

        {/* FOOTER ACTIONS */}
        <div className="flex flex-col sm:flex-row sm:justify-start gap-3 bottom-0">
          <Button
            type="submit"
            disabled={isSubmitting}
            className="shadow-sm w-full sm:w-auto"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/admin/app-configuration")}
            disabled={isSubmitting}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
