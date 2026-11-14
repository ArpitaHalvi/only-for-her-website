"use client";

import { useCallback, useEffect, useState } from "react";
import type { SavedAddress } from "@/lib/account";
import { api } from "@/lib/auth";
import { STATES } from "@/lib/orders";

type Form = Omit<SavedAddress, "_id">;
const TYPES: { v: Form["type"]; label: string }[] = [
  { v: "home", label: "Home" },
  { v: "office", label: "Office" },
  { v: "someone_else", label: "Someone else" },
  { v: "other", label: "Other" },
];
const blank: Form = { type: "home", label: "Home", relation: "", fullName: "", phone: "", line1: "", line2: "", landmark: "", city: "", state: "", country: "India", pincode: "", isDefault: false };

export default function AccountAddresses() {
  const [list, setList] = useState<SavedAddress[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ data: SavedAddress[] }>("/customer/me/addresses", { auth: true })
      .then((r) => setList(r.data))
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const open = (a?: SavedAddress) => {
    setErrs({});
    setError("");
    if (a) {
      const { _id, ...rest } = a;
      setForm({ ...blank, ...rest });
      setEditing(_id);
    } else {
      setForm({ ...blank, isDefault: (list?.length ?? 0) === 0 });
      setEditing("new");
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const v: Record<string, string> = {};
    if (form.fullName.trim().length < 2) v.fullName = "Enter the recipient's name.";
    if (!/^[6-9]\d{9}$/.test(form.phone)) v.phone = "Enter a valid 10-digit mobile number.";
    if (!form.line1.trim()) v.line1 = "Enter the house or flat number and street.";
    if (!form.city.trim()) v.city = "Enter the city.";
    if (!form.state) v.state = "Select the state.";
    if (!/^[1-9]\d{5}$/.test(form.pincode)) v.pincode = "Enter a valid 6-digit PIN code.";
    if (form.type === "other" && !form.label.trim()) v.label = "Enter a name for this address.";
    if (form.type === "someone_else" && !form.relation?.trim()) v.relation = "Say how they are related to you.";
    setErrs(v);
    if (Object.keys(v).length) return;

    // the label shown on the card follows the type, unless they typed their own
    const label = form.type === "home" ? "Home" : form.type === "office" ? "Office" : form.type === "someone_else" ? `Gift for ${form.fullName.split(" ")[0]}` : form.label.trim();
    setBusy(true);
    try {
      const body = { ...form, label };
      const r = editing === "new"
        ? await api<{ data: SavedAddress[] }>("/customer/me/addresses", { method: "POST", auth: true, body })
        : await api<{ data: SavedAddress[] }>(`/customer/me/addresses/${editing}`, { method: "PUT", auth: true, body });
      setList(r.data);
      setEditing(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this address?")) return;
    try {
      const r = await api<{ data: SavedAddress[] }>(`/customer/me/addresses/${id}`, { method: "DELETE", auth: true });
      setList(r.data);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const makeDefault = async (id: string) => {
    try {
      const r = await api<{ data: SavedAddress[] }>(`/customer/me/addresses/${id}`, { method: "PUT", auth: true, body: { isDefault: true } });
      setList(r.data);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const err = (k: string) => (errs[k] ? <span className="f-err">{errs[k]}</span> : null);

  return (
    <>
      <div className="acct-head first">
        <h1 className="acct-title">My Addresses</h1>
        {!editing && <button className="btn btn-wine btn-sq" onClick={() => open()}>Add address</button>}
      </div>
      {error && <p className="auth-alert" role="alert">{error}</p>}

      {editing ? (
        <form className="od-card addr-form" onSubmit={save} noValidate>
          <h2>{editing === "new" ? "Add address" : "Edit address"}</h2>
          <fieldset className="seg">
            <legend>Address type</legend>
            {TYPES.map((t) => (
              <label key={t.v} className={form.type === t.v ? "on" : ""}>
                <input type="radio" name="type" checked={form.type === t.v} onChange={() => set("type", t.v)} /> {t.label}
              </label>
            ))}
          </fieldset>
          <div className="f-grid">
            {form.type === "other" && (
              <label className="f full">Address name
                <input value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="e.g. Studio" />{err("label")}
              </label>
            )}
            {form.type === "someone_else" && (
              <label className="f full">Relation to you
                <input value={form.relation ?? ""} onChange={(e) => set("relation", e.target.value)} placeholder="e.g. Mother" />{err("relation")}
              </label>
            )}
            <label className="f">Full name<input value={form.fullName} onChange={(e) => set("fullName", e.target.value)} autoComplete="name" />{err("fullName")}</label>
            <label className="f">Mobile number<input inputMode="numeric" maxLength={10} value={form.phone} onChange={(e) => set("phone", e.target.value.replace(/\D/g, ""))} autoComplete="tel-national" />{err("phone")}</label>
            <label className="f full">House / flat, street<input value={form.line1} onChange={(e) => set("line1", e.target.value)} autoComplete="address-line1" />{err("line1")}</label>
            <label className="f full">Area / locality (optional)<input value={form.line2 ?? ""} onChange={(e) => set("line2", e.target.value)} autoComplete="address-line2" /></label>
            <label className="f full">Landmark (optional)<input value={form.landmark ?? ""} onChange={(e) => set("landmark", e.target.value)} /></label>
            <label className="f">City<input value={form.city} onChange={(e) => set("city", e.target.value)} autoComplete="address-level2" />{err("city")}</label>
            <label className="f">State
              <select value={form.state} onChange={(e) => set("state", e.target.value)}>
                <option value="">Select state</option>
                {STATES.map((s) => <option key={s}>{s}</option>)}
              </select>{err("state")}
            </label>
            <label className="f">PIN code<input inputMode="numeric" maxLength={6} value={form.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))} autoComplete="postal-code" />{err("pincode")}</label>
            <label className="f">Country<select value={form.country} onChange={(e) => set("country", e.target.value)}><option>India</option></select></label>
          </div>
          <label className="inline-check">
            <input type="checkbox" checked={form.isDefault} onChange={(e) => set("isDefault", e.target.checked)} /> Make this my default address
          </label>
          <div className="od-actions">
            <button className="btn btn-wine btn-sq" type="submit" disabled={busy}>{busy ? "Saving…" : "Save address"}</button>
            <button className="btn btn-outline btn-sq" type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      ) : !list ? (
        <div aria-busy="true" style={{ minHeight: 160 }} />
      ) : list.length === 0 ? (
        <div className="acct-empty"><p>No saved addresses yet.</p></div>
      ) : (
        <ul className="addr-grid">
          {list.map((a) => (
            <li key={a._id} className="od-card addr-card">
              <p className="addr-label">{a.label}{a.type === "someone_else" && a.relation ? ` (${a.relation})` : ""}{a.isDefault && <span className="pill-status st-confirmed">Default</span>}</p>
              <address className="os-addr">
                <b>{a.fullName}</b><br />
                {a.line1}{a.line2 && `, ${a.line2}`}{a.landmark && `, near ${a.landmark}`}<br />
                {a.city}, {a.state} {a.pincode}<br />
                {a.country ?? "India"}<br />
                {a.phone}
              </address>
              <div className="addr-actions">
                <button className="link-btn" onClick={() => open(a)}>Edit</button>
                <button className="link-btn" onClick={() => remove(a._id)}>Delete</button>
                {!a.isDefault && <button className="link-btn" onClick={() => makeDefault(a._id)}>Set as default</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
