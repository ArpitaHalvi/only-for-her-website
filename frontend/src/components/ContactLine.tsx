"use client";

import Link from "next/link";
import { clean, telHref, useAppConfig } from "@/lib/config";

/** "Email x or call y": built from the shop's own contact details; shows only what is set. */
export default function ContactLine() {
  const { config } = useAppConfig();
  const email = clean(config?.email);
  const phone = clean(config?.phoneNumber);
  if (!email && !phone) return <>Write to us through the <Link href="/contact">contact page</Link>.</>;
  return (
    <>
      {email && <>Email <a href={`mailto:${email}`}>{email}</a></>}
      {email && phone && " or "}
      {phone && <>{email ? "call" : "Call"} <a href={telHref(phone)}>{phone}</a></>}.
    </>
  );
}
