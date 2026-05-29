import "server-only";

/**
 * URL-safe random token. 32 bytes = 256 bits of entropy, encoded as 43
 * base64url chars. Generated in Node/Edge crypto and never persisted in
 * plaintext anywhere outside the invite_tokens table.
 */
export function generateInviteToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return base64url(bytes);
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * One-time random password used to mint a fresh Supabase session for a
 * non-admin user on every invite-link visit. Never stored anywhere.
 */
export function generateEphemeralPassword(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return base64url(bytes);
}
