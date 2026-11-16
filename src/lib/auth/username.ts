import { env } from "@/lib/env";

/**
 * Supabase Auth requires a unique email per user. BlackFoxx is a username-only
 * product, so we synthesize an email behind the scenes. The user never sees
 * it; it's a stable identifier for auth.users only.
 */
export function usernameToInternalEmail(username: string): string {
  const normalized = username.trim().toLowerCase();
  return `${normalized}@${env.INTERNAL_EMAIL_DOMAIN}`;
}

/** Same rule the DB CHECK constraint enforces, kept in sync. */
export const USERNAME_REGEX = /^[a-z0-9_]{3,24}$/;
