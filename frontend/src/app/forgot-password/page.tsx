import { redirect } from "next/navigation";

/* The backend has no passwords, so there is nothing to reset: signing in uses a one-time email code. */
export default function ForgotPasswordPage() {
  redirect("/login");
}
