import { USERNAME_REGEX } from "@/lib/auth/username";

export const DISPLAY_NAME_RE = new RegExp("^[^\\u0000-\\u001F\\u007F-\\u009F<>]+$", "u");

export function usernameProblem(value: string): string | undefined {
  if (value.length < 3) return "At least 3 characters";
  if (value.length > 24) return "At most 24 characters";
  if (!USERNAME_REGEX.test(value)) return "Lowercase letters, numbers, and underscores only";
  return undefined;
}

export function passwordProblem(value: string): string | undefined {
  if (value.length < 8) return "At least 8 characters";
  if (value.length > 128) return "Too long";
  return undefined;
}

export function displayNameProblem(value: string): string | undefined {
  const name = value.trim();
  if (!name) return undefined;
  if (name.length > 40) return "Keep it under 40 characters";
  if (!DISPLAY_NAME_RE.test(name)) return "Please use a simpler name";
  return undefined;
}
