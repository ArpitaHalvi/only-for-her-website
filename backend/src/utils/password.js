/**
 * Password rules for back-office accounts.
 * Returns an error message, or null when the password is acceptable.
 */
export function passwordProblem(password) {
  if (typeof password !== "string") return "Password is required.";
  if (password.length < 10) return "Password must be at least 10 characters.";
  if (password.length > 128) return "Password must be at most 128 characters.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include an uppercase letter, a lowercase letter and a number.";
  }
  return null;
}

export const BCRYPT_ROUNDS = 12;

export const isValidEmail = (email) =>
  typeof email === "string" && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
