import "server-only";
import { createHash, randomInt } from "node:crypto";
import {
  SIGNUP_CODE_ALPHABET,
  SIGNUP_CODE_LENGTH,
  normalizeSignupCode,
} from "@/lib/signup-code";

/**
 * Server side of sign-up invite codes. The database never holds a code, only
 * its SHA-256 hash: codes are long random strings, so a plain hash is enough
 * (there is nothing for a dictionary attack to guess).
 */

/** A new random code, without the dash ("K7M2Q9XPDA"). About 49 bits. */
export function generateSignupCode(): string {
  let code = "";
  for (let i = 0; i < SIGNUP_CODE_LENGTH; i++) {
    code += SIGNUP_CODE_ALPHABET[randomInt(SIGNUP_CODE_ALPHABET.length)];
  }
  return code;
}

/** What is stored and looked up. Accepts the code however the person typed it. */
export function hashSignupCode(code: string): string {
  return createHash("sha256").update(normalizeSignupCode(code)).digest("hex");
}

/** The last four characters, kept so the admin can tell codes apart. */
export function signupCodeHint(code: string): string {
  return normalizeSignupCode(code).slice(-4);
}
