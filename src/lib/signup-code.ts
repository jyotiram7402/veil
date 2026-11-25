export const SIGNUP_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
export const SIGNUP_CODE_LENGTH = 10;

export function normalizeSignupCode(input: string): string {
  let out = "";
  for (const ch of input.toUpperCase()) {
    if (SIGNUP_CODE_ALPHABET.includes(ch)) out += ch;
    if (out.length === SIGNUP_CODE_LENGTH) break;
  }
  return out;
}

export function formatSignupCode(input: string): string {
  const code = normalizeSignupCode(input);
  return code.length > 5 ? `${code.slice(0, 5)}-${code.slice(5)}` : code;
}

export function isCompleteSignupCode(input: string): boolean {
  return normalizeSignupCode(input).length === SIGNUP_CODE_LENGTH;
}
