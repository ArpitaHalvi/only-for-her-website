import { Resend } from "resend";
import { withoutLogo } from "./emailBrand.js";

// Created on first use: `new Resend()` throws without a key, which would stop
// the server from starting when RESEND_API_KEY is not set.
let resend;
const client = () => (resend ??= new Resend(process.env.RESEND_API_KEY));

/**
 * Sends an email through Resend. Without RESEND_API_KEY nothing is sent and
 * `false` is returned (development). Throws when the email service refuses it.
 */
export async function sendMail({ to, subject, html, attachments }) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`📧 Email to ${to} not sent (RESEND_API_KEY not configured): ${subject}`);
    return false;
  }
  const from = `Only For Her ${process.env.MAIL_FROM}`;
  let { error } = await client().emails.send({ from, to, subject, html, ...(attachments?.length ? { attachments } : {}) });
  if (error && attachments?.length) {
    // Never lose a login code or an order email over a picture: send it again without the logo
    ({ error } = await client().emails.send({ from, to, subject, html: withoutLogo(html) }));
  }
  // Resend reports problems (unverified domain, bad key) in `error`, it does not throw
  if (error) throw new Error(error.message || "The email service refused the message.");
  return true;
}
