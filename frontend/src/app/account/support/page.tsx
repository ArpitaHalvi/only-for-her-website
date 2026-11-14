import Link from "next/link";
import ContactLine from "@/components/ContactLine";

// The account area renders only after the sign-in check, so skip instant-navigation validation.
export const instant = false;

export default function SupportPage() {
  return (
    <>
      <h1 className="acct-title">Help &amp; Support</h1>
      <p className="acct-sub">We&apos;re happy to help with orders, returns, exchanges and care.</p>
      <ul className="help-grid">
        <li className="od-card"><h2>Returns &amp; exchanges</h2><p>To request a return or exchange, write to us with your order number and we&apos;ll guide you. See the <Link href="/returns-refunds">returns policy</Link>.</p></li>
        <li className="od-card"><h2>Delivery</h2><p>Check how long shipping takes and what it costs in our <Link href="/shipping-policy">shipping policy</Link>.</p></li>
        <li className="od-card"><h2>Jewellery care</h2><p>Keep your pieces shining with the <Link href="/jewellery-care">care guide</Link>.</p></li>
        <li className="od-card"><h2>Contact us</h2><p><ContactLine /> Please include your order number.</p></li>
        <li className="od-card"><h2>FAQ</h2><p>Quick answers are in our <Link href="/faq">frequently asked questions</Link>.</p></li>
      </ul>
    </>
  );
}
