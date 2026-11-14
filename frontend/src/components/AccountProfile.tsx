"use client";

import { useState } from "react";
import { api } from "@/lib/auth";
import { fmtDate } from "@/lib/account";
import { useAccount } from "./AccountShell";

export default function AccountProfile() {
  const { me, reload } = useAccount();
  const [name, setName] = useState(me.name ?? "");
  const [phone, setPhone] = useState(me.phone ?? "");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const v: Record<string, string> = {};
    if (name.trim().length < 2) v.name = "Enter your full name.";
    if (phone && !/^[6-9]\d{9}$/.test(phone)) v.phone = "Enter a valid 10-digit mobile number.";
    setErrs(v);
    setMsg(null);
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      await api("/customer/me", { method: "PATCH", auth: true, body: { name: name.trim(), phone: phone.trim() } });
      await reload();
      setMsg({ ok: true, text: "Your profile has been updated." });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="acct-title">Profile Information</h1>
      <form className="od-card addr-form" onSubmit={save} noValidate>
        {msg && <p className={msg.ok ? "pdp-note" : "auth-alert"} role="status">{msg.text}</p>}
        <div className="f-grid">
          <label className="f full">Full name
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" aria-invalid={!!errs.name} />
            {errs.name && <span className="f-err">{errs.name}</span>}
          </label>
          <label className="f">Email
            <input value={me.email ?? ""} readOnly aria-describedby="em-h" />
            <small id="em-h" className="muted">Your email is how you sign in, so it can&apos;t be changed here.</small>
          </label>
          <label className="f">Mobile number
            <input inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} autoComplete="tel-national" aria-invalid={!!errs.phone} />
            {errs.phone && <span className="f-err">{errs.phone}</span>}
          </label>
        </div>
        <button className="btn btn-wine btn-sq" type="submit" disabled={busy}>{busy ? "Saving…" : "Update profile"}</button>
        <p className="co-sub">
          Signed in with {me.provider === "google" ? "Google" : "an email code"} · Member since {fmtDate(me.createdAt)}
          {!me.isVerified && " · Email not verified yet"}
        </p>
      </form>
    </>
  );
}
