import crypto from "crypto";
import Razorpay from "razorpay";

/**
 * Thin wrapper around Razorpay.
 *
 * RAZORPAY_MOCK=1 (development only, ignored in production) replaces the
 * network calls with local fakes so the whole checkout can be tried without
 * Razorpay keys. Signatures are still verified for real.
 */
const isMock = () => process.env.RAZORPAY_MOCK === "1" && process.env.NODE_ENV !== "production";

// In mock mode the real credentials are never used, so a test can not touch a live account.
const keyId = () => (isMock() ? "rzp_test_mock" : process.env.RAZORPAY_KEY_ID);
const keySecret = () => (isMock() ? process.env.RAZORPAY_MOCK_SECRET || "mock-secret" : process.env.RAZORPAY_KEY_SECRET);

let client;
function getClient() {
  if (!keyId() || !keySecret()) {
    throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in .env");
  }
  if (!client) client = new Razorpay({ key_id: keyId(), key_secret: keySecret() });
  return client;
}

export const gatewayPublicKey = () => keyId();

/** Creates the gateway-side order. `amountPaise` is an integer number of paise. */
export async function createGatewayOrder({ amountPaise, receipt, notes }) {
  if (isMock()) {
    return {
      id: `order_mock_${crypto.randomBytes(7).toString("hex")}`,
      amount: amountPaise,
      currency: "INR",
      receipt,
      status: "created",
    };
  }
  return getClient().orders.create({ amount: amountPaise, currency: "INR", receipt, notes });
}

/** Checks the signature the browser returns after a successful payment. */
export function verifyPaymentSignature({ orderId, paymentId, signature }) {
  const expected = crypto
    .createHmac("sha256", keySecret() || "")
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return safeEqual(expected, signature);
}

/** Checks the X-Razorpay-Signature header of a webhook against its raw body. */
export function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !rawBody || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}

/** Refunds (part of) a captured payment. */
export async function refundGatewayPayment(paymentId, amountPaise, notes) {
  if (isMock()) {
    return { id: `rfnd_mock_${crypto.randomBytes(6).toString("hex")}`, payment_id: paymentId, amount: amountPaise, status: "processed" };
  }
  return getClient().payments.refund(paymentId, { amount: amountPaise, notes });
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b ?? ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
