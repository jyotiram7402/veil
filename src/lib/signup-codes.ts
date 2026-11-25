import "server-only";
import { createHash, randomInt } from "node:crypto";
import {
  SIGNUP_CODE_ALPHABET,
  SIGNUP_CODE_LENGTH,
  normalizeSignupCode,
} from "@/lib/signup-code";

export function generateSignupCode(): string {
  let code = "";
  for (let i = 0; i < SIGNUP_CODE_LENGTH; i++) {
    code += SIGNUP_CODE_ALPHABET[randomInt(SIGNUP_CODE_ALPHABET.length)];
  }
  return code;
}

export function hashSignupCode(code: string): string {
  return createHash("sha256").update(normalizeSignupCode(code)).digest("hex");
}

export function signupCodeHint(code: string): string {
  return normalizeSignupCode(code).slice(-4);
}
