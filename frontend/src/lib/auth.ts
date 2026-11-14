/*
 * Customer session + API helper.
 * The backend is passwordless: email OTP (send-otp / verify-otp) or Google OAuth.
 * It returns a JWT valid for 30 days, sent back as `Authorization: Bearer <token>`.
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api/v1";

const KEY = "ofh-token";

/** "Remember me" keeps the session across browser restarts; otherwise it ends when the tab closes. */
export function saveToken(token: string, remember = true) {
  try {
    sessionStorage.removeItem(KEY);
    localStorage.removeItem(KEY);
    (remember ? localStorage : sessionStorage).setItem(KEY, token);
    window.dispatchEvent(new Event("ofh-auth"));
  } catch {
    /* storage unavailable */
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
    window.dispatchEvent(new Event("ofh-auth"));
  } catch {
    /* ignore */
  }
}

export type Customer = {
  _id: string;
  name?: string;
  email?: string;
  phone?: string;
  avatar?: string;
  provider: "google" | "email_otp" | "phone_otp";
  isVerified: boolean;
  createdAt: string;
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        ...(init.auth ? { Authorization: `Bearer ${getToken() ?? ""}` } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError("We couldn't reach the server. Check your connection and try again.", 0);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) throw new ApiError(json.message ?? "Something went wrong. Please try again.", res.status);
  return json as T;
}
