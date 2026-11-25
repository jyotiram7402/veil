import { env } from "@/lib/env";

export function usernameToInternalEmail(username: string): string {
  const normalized = username.trim().toLowerCase();
  return `${normalized}@${env.INTERNAL_EMAIL_DOMAIN}`;
}

export const USERNAME_REGEX = /^[a-z0-9_]{3,24}$/;
