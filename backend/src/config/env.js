/**
 * Fails fast at start-up when the environment is unsafe, instead of running with
 * a guessable secret. Call once from server.js after dotenv has loaded.
 */
export function validateEnv() {
  const isProd = process.env.NODE_ENV === "production";
  const problems = [];

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    problems.push("JWT_SECRET is not set.");
  } else if (secret.length < 32) {
    problems.push("JWT_SECRET must be at least 32 characters.");
  }

  if (!process.env.MONGODB_URI) problems.push("MONGODB_URI is not set.");

  if (isProd) {
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
      problems.push("RAZORPAY_WEBHOOK_SECRET is not set (payment webhooks would be rejected).");
    }
    if (!process.env.NEXT_FRONTEND_URL || !process.env.ADMIN_FRONTEND_URL) {
      problems.push("NEXT_FRONTEND_URL and ADMIN_FRONTEND_URL must be set (CORS allow-list).");
    }
    if (process.env.RAZORPAY_MOCK === "1") {
      console.warn("RAZORPAY_MOCK is ignored in production.");
    }
  }

  if (problems.length) {
    console.error("Unsafe or incomplete environment:\n - " + problems.join("\n - "));
    process.exit(1);
  }
}
