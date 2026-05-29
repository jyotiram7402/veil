import { env } from "@/lib/env";

/**
 * Supabase Auth requires a unique email per user. Rooms is a username-only
 * product, so we synthesize an email behind the scenes. The user never sees
 * it; it's a stable identifier for auth.users only.
 */
export function usernameToInternalEmail(username: string): string {
  const normalized = username.trim().toLowerCase();
  return `${normalized}@${env.INTERNAL_EMAIL_DOMAIN}`;
}

export function internalEmailToUsername(email: string): string {
  const at = email.indexOf("@");
  return at === -1 ? email : email.slice(0, at);
}

/** Same rule the DB CHECK constraint enforces, kept in sync. */
export const USERNAME_REGEX = /^[a-z0-9_]{3,24}$/;
