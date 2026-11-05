import "server-only";
import { hash, verify } from "@node-rs/argon2";

// OWASP-recommended argon2id parameters.
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export function hashPassword(password: string) {
  return hash(password, OPTS);
}

export async function verifyPassword(hashed: string, password: string) {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}

export function validatePasswordStrength(pw: string): string | null {
  if (pw.length < 10) return "Password must be at least 10 characters.";
  if (pw.length > 200) return "Password is too long.";
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) => r.test(pw)).length;
  if (classes < 3) return "Use at least three of: lowercase, uppercase, numbers, symbols.";
  return null;
}

/** Readable random password for new accounts (shown once to the admin). */
export function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  const body = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `${body.slice(0, 5)}-${body.slice(5, 10)}-${body.slice(10)}!`;
}
