"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { footerColumns } from "@/lib/data";
import {
  addressLines,
  clean,
  telHref,
  useAppConfig,
  whatsappHref,
} from "@/lib/config";
import Logo from "./Logo";
import {
  FacebookIcon,
  InstagramIcon,
  LinkedinIcon,
  WhatsappIcon,
  XIcon,
  YoutubeIcon,
} from "./Icons";

export default function Footer() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const { config } = useAppConfig();
  // The year is read in the browser only (the server snapshot is a fixed fallback), so no effect or extra render is needed.
  const year = useSyncExternalStore(
    () => () => {},
    () => new Date().getFullYear(),
    () => 2026,
  );
  const socials = [
    {
      label: "Instagram",
      href: clean(config?.instagramLink),
      icon: <InstagramIcon />,
    },
    {
      label: "Facebook",
      href: clean(config?.facebookLink),
      icon: <FacebookIcon />,
    },
    {
      label: "YouTube",
      href: clean(config?.youtubeLink),
      icon: <YoutubeIcon />,
    },
    { label: "X", href: clean(config?.twitterLink), icon: <XIcon /> },
    {
      label: "LinkedIn",
      href: clean(config?.linkedinLink),
      icon: <LinkedinIcon />,
    },
    { label: "WhatsApp", href: whatsappHref(config), icon: <WhatsappIcon /> },
  ].filter((x) => x.href);
  const address = addressLines(config);
  const phone = clean(config?.phoneNumber);
  const contactEmail = clean(config?.email);
  const name = clean(config?.appName) || "Only For Her";

  return (
    <footer className="footer">
      <section className="newsletter" aria-labelledby="nl-h">
        <div className="wrap nl-inner">
          <div>
            <h2 id="nl-h" className="h2 on-wine">
              Be the first to know.
            </h2>
            <p>
              New collections, festive edits and subscriber-only offers,
              straight to your inbox.
            </p>
          </div>
          <form
            className="nl-form"
            onSubmit={(e) => {
              e.preventDefault();
              // TODO: POST to newsletter endpoint once the backend exists
              setDone(true);
            }}
          >
            {done ? (
              <p className="nl-done" role="status">
                Thank you. You&apos;re on the list.
              </p>
            ) : (
              <>
                {/* <div className="nl-row">
                  <label htmlFor="nl-email" className="sr-only">Email address</label>
                  <input
                    id="nl-email"
                    type="email"
                    required
                    placeholder="Your email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                  <button type="submit" className="btn btn-gold">Subscribe</button>
                </div>
                <p className="fine">
                  By subscribing you agree to receive marketing emails from Only For Her. Unsubscribe any time.
                  See our <Link href="/privacy-policy">Privacy Policy</Link>.
                </p> */}
              </>
            )}
          </form>
        </div>
      </section>

      <div className="wrap footer-grid" style={{ "--cols": footerColumns.length } as React.CSSProperties}>
        <div className="footer-brand">
          <Link
            href="/"
            className="logo on-dark"
            aria-label="Only For Her, home"
          >
            <Logo height={96} light />
          </Link>
          <p>
            Jewellery made to celebrate your beauty and your beliefs, designed
            with care and meant to be worn every day.
          </p>
          {socials.length > 0 && (
            <div className="social">
              {socials.map((x) => (
                <a
                  key={x.label}
                  href={x.href}
                  aria-label={x.label}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {x.icon}
                </a>
              ))}
            </div>
          )}
          {(address.length > 0 || phone || contactEmail) && (
            <address className="footer-contact">
              {address.map((a) => (
                <p key={a}>{a}</p>
              ))}
              {phone && (
                <p>
                  <a href={telHref(phone)}>{phone}</a>
                </p>
              )}
              {contactEmail && (
                <p>
                  <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
                </p>
              )}
            </address>
          )}
        </div>
        {footerColumns.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h3>{c.title}</h3>
            <ul>
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="wrap footer-base">
        <span>
          &copy; {year} {name}. All rights reserved.
        </span>
        {contactEmail && <a href={`mailto:${contactEmail}`}>{contactEmail}</a>}
      </div>
    </footer>
  );
}
