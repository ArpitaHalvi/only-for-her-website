import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/*
 * The logo at the top of every email. It travels inside the message (an inline attachment
 * referenced as cid:brand-logo), so it shows without any public web address and without the
 * reader having to "load remote images".
 */
const LOGO = path.join(path.dirname(fileURLToPath(import.meta.url)), "../assets/logo.png");
export const LOGO_CID = "brand-logo";

export function logoAttachments() {
  try {
    return [{ filename: "logo.png", content: fs.readFileSync(LOGO).toString("base64"), contentId: LOGO_CID }];
  } catch {
    return []; // logo file missing: the email is still sent, without it
  }
}

export const logoHtml = (alt = "Only For Her") =>
  `<div style="text-align:center;margin:0 0 24px;"><img src="cid:${LOGO_CID}" alt="${alt}" width="200" style="display:inline-block;width:200px;max-width:70%;height:auto;border:0;" /></div>`;

/** The same email without the logo, for the rare case the mail service refuses the attachment. */
export const withoutLogo = (html) => html.replace(/<div[^>]*>\s*<img[^>]*cid:brand-logo[^>]*>\s*<\/div>/g, "");
