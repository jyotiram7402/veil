/**
 * Shape of a sign-up invite code, shared by the form and the server.
 *
 * A code is ten characters, shown as two groups of five: "K7M2Q-9XPDA". The
 * alphabet leaves out look-alikes (no 0/O, 1/I/L, U), so a code can be read
 * out loud or typed from a screenshot without mistakes.
 */
export const SIGNUP_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
export const SIGNUP_CODE_LENGTH = 10;

/** Upper-cases the input and drops everything that cannot be part of a code. */
export function normalizeSignupCode(input: string): string {
  let out = "";
  for (const ch of input.toUpperCase()) {
    if (SIGNUP_CODE_ALPHABET.includes(ch)) out += ch;
    if (out.length === SIGNUP_CODE_LENGTH) break;
  }
  return out;
}

/** "k7m2q9xpda" becomes "K7M2Q-9XPDA". Also tidies a code that is half typed. */
export function formatSignupCode(input: string): string {
  const code = normalizeSignupCode(input);
  return code.length > 5 ? `${code.slice(0, 5)}-${code.slice(5)}` : code;
}

/** True when the input holds a whole code (it may still be a wrong one). */
export function isCompleteSignupCode(input: string): boolean {
  return normalizeSignupCode(input).length === SIGNUP_CODE_LENGTH;
}
