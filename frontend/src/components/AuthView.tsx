"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { API_URL, api, saveToken, type Customer } from "@/lib/auth";
import Logo from "./Logo";
import JewelArt from "./JewelArt";

type Mode = "login" | "register";

const RESEND_SECONDS = 30;

const URL_ERRORS: Record<string, string> = {
  google_failed: "Google sign-in didn't complete. Please try again.",
  google_not_configured: "Google sign-in isn't available right now. Use your email instead.",
  blocked: "This account has been blocked. Please contact us.",
  server_error: "Something went wrong on our side. Please try again.",
};

const GoogleG = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path fill="#4285F4" d="M22.5 12.2c0-.8-.1-1.5-.2-2.2H12v4.200h5.900a5 5 0 0 1-2.200 3.300v2.700h3.500c2.100-1.900 3.300-4.700 3.300-8Z" />
    <path fill="#34A853" d="M12 23c3 0 5.400-1 7.200-2.700l-3.500-2.700c-1 .7-2.200 1-3.700 1-2.800 0-5.300-1.900-6.100-4.500H2.300v2.800A11 11 0 0 0 12 23Z" />
    <path fill="#FBBC05" d="M5.900 14.100a6.600 6.600 0 0 1 0-4.200V7.100H2.300a11 11 0 0 0 0 9.800l3.600-2.800Z" />
    <path fill="#EA4335" d="M12 5.400c1.600 0 3.100.6 4.200 1.700l3.100-3.100A11 11 0 0 0 2.300 7.100l3.600 2.800C6.700 7.300 9.200 5.400 12 5.400Z" />
  </svg>
);

export default function AuthView({ mode }: { mode: Mode }) {
  const router = useRouter();
  const isRegister = mode === "register";

  const [step, setStep] = useState<"details" | "otp">("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [marketing, setMarketing] = useState(false);
  const [terms, setTerms] = useState(false);
  const [remember, setRemember] = useState(true);
  const [otp, setOtp] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [google, setGoogle] = useState(false);
  const otpRef = useRef<HTMLInputElement>(null);

  /* which sign-in methods the server offers, and any error from the Google redirect */
  useEffect(() => {
    api<{ data: { google: boolean } }>("/customer/auth/providers")
      .then((r) => setGoogle(!!r.data.google))
      .catch(() => setGoogle(false));
    const code = new URLSearchParams(window.location.search).get("error");
    if (code) setFormError(URL_ERRORS[code] ?? URL_ERRORS.server_error);
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (step === "otp") otpRef.current?.focus();
  }, [step]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (isRegister && name.trim().length < 2) e.name = "Enter your full name.";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = "Enter a valid email address.";
    if (isRegister && phone && !/^[6-9]\d{9}$/.test(phone)) e.phone = "Enter a valid 10-digit mobile number.";
    if (isRegister && !terms) e.terms = "Please accept the terms and privacy policy to continue.";
    return e;
  };

  const sendOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    const v = step === "details" ? validate() : {};
    setErrors(v);
    setFormError("");
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      await api("/customer/auth/send-otp", { body: { email: email.trim().toLowerCase() } });
      setStep("otp");
      setOtp("");
      setInfo(`We sent a 6-digit code to ${email.trim()}. It is valid for 10 minutes.`);
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(otp)) {
      setErrors({ otp: "Enter the 6-digit code." });
      return;
    }
    setErrors({});
    setFormError("");
    setBusy(true);
    try {
      const r = await api<{ token: string; customer: Customer }>("/customer/auth/verify-otp", {
        body: { email: email.trim().toLowerCase(), otp },
      });
      saveToken(r.token, remember);

      /* new customers: the backend creates the account on first sign-in, so save name and phone now */
      if (isRegister) {
        try {
          await api("/customer/me", { method: "PATCH", auth: true, body: { name: name.trim(), phone: phone || undefined, marketingOptIn: marketing } });
        } catch {
          /* signed in anyway; they can add details from their account */
        }
      }
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(next && next.startsWith("/") ? next : "/account");
    } catch (err) {
      setFormError((err as Error).message);
      setBusy(false);
    }
  };

  // four pictures, all portrait
  const tiles = [
    ["sand", "necklace"],
    ["wine", "ganesha"],
    ["gold", "ring"],
    ["ivory", "earring"],
  ] as const;

  return (
    <div className="auth">
      <section className="auth-form-side">
        <Link href="/" className="auth-logo" aria-label="Only For Her, home"><Logo height={84} /></Link>

        <div className="auth-box">
          {step === "details" ? (
            <form onSubmit={sendOtp} noValidate>
              <h1>{isRegister ? "Create your account" : "Login to your account"}</h1>
              <p className="auth-lead">
                {isRegister
                  ? "No password to remember. We'll email you a code to confirm it's you."
                  : "Enter your email and we'll send you a one-time code. No password needed."}
              </p>

              {formError && <p className="auth-alert" role="alert">{formError}</p>}

              {isRegister && (
                <label className="af">Full name
                  <input name="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" aria-invalid={!!errors.name} />
                  {errors.name && <span className="f-err">{errors.name}</span>}
                </label>
              )}

              <label className="af">Email
                <input name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" aria-invalid={!!errors.email} />
                {errors.email && <span className="f-err">{errors.email}</span>}
              </label>

              {isRegister && (
                <label className="af">Mobile number <small>(optional)</small>
                  <input name="phone" inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} autoComplete="tel-national" aria-invalid={!!errors.phone} />
                  {errors.phone && <span className="f-err">{errors.phone}</span>}
                </label>
              )}

              {isRegister ? (
                <div className="auth-checks">
                  <label className="inline-check">
                    <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
                    <span>I agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy-policy">Privacy Policy</Link>.</span>
                  </label>
                  {errors.terms && <span className="f-err">{errors.terms}</span>}
                  <label className="inline-check">
                    <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
                    <span>Send me offers and new collection updates.</span>
                  </label>
                </div>
              ) : (
                <div className="auth-row">
                  <label className="switch">
                    <input type="checkbox" role="switch" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                    <i aria-hidden="true" /> Remember me
                  </label>
                </div>
              )}

              <button className="auth-btn" type="submit" disabled={busy}>
                {busy ? "Sending code…" : isRegister ? "Create account" : "Send login code"}
              </button>

              {google && (
                <>
                  <div className="auth-or"><span>or</span></div>
                  <a className="auth-google" href={`${API_URL}/customer/auth/google`}>
                    <GoogleG /> Continue with Google
                  </a>
                </>
              )}

              <p className="auth-switch">
                {isRegister ? (
                  <>Already have an account? <Link href="/login">Sign in</Link></>
                ) : (
                  <>Don&apos;t have an account? <Link href="/register">Sign up</Link></>
                )}
              </p>
            </form>
          ) : (
            <form onSubmit={verify} noValidate>
              <h1>Check your email</h1>
              <p className="auth-lead" role="status">{info}</p>

              {formError && <p className="auth-alert" role="alert">{formError}</p>}

              <label className="af">Verification code
                <input
                  ref={otpRef}
                  name="otp"
                  className="otp-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="······"
                  aria-invalid={!!errors.otp}
                />
                {errors.otp && <span className="f-err">{errors.otp}</span>}
              </label>

              <button className="auth-btn" type="submit" disabled={busy}>{busy ? "Verifying…" : "Verify and sign in"}</button>

              <div className="auth-resend">
                <button type="button" className="link-btn" disabled={cooldown > 0 || busy} onClick={() => sendOtp()}>
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
                </button>
                <button type="button" className="link-btn" onClick={() => { setStep("details"); setFormError(""); }}>
                  Change email
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      <aside className="auth-collage" aria-hidden="true">
        {tiles.map(([tone, kind]) => (
          <div key={kind} className={`auth-tile t-${tone}`}>
            <JewelArt kind={kind} tone={tone} className="fill" />
          </div>
        ))}
      </aside>
    </div>
  );
}
