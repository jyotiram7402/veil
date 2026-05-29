/**
 * Password hashing for the invite-link gate.
 *
 * Uses PBKDF2-SHA-256 via Web Crypto so the same code runs in Node and Edge
 * without a native dep. Format:
 *
 *   pbkdf2$<iter>$<salt-b64url>$<hash-b64url>
 *
 * The gate password is admin-set, low-traffic, and the link itself is
 * already a 256-bit secret — so 100k iterations is plenty.
 */

const ITERATIONS = 100_000;
const KEY_LEN_BYTES = 32;
const SALT_BYTES = 16;
const HASH_NAME = "SHA-256";

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const base = (str + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(base);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(password: string, salt: Uint8Array, iter: number, lenBytes: number) {
  const enc = new TextEncoder();
  const baseKey = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as ArrayBuffer, iterations: iter, hash: HASH_NAME },
    baseKey,
    lenBytes * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(SALT_BYTES);
  globalThis.crypto.getRandomValues(salt);
  const hash = await deriveKey(password, salt, ITERATIONS, KEY_LEN_BYTES);
  return `pbkdf2$${ITERATIONS}$${b64urlEncode(salt)}$${b64urlEncode(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iter = parseInt(parts[1]!, 10);
  if (!Number.isFinite(iter) || iter < 1000) return false;
  const salt = b64urlDecode(parts[2]!);
  const expected = b64urlDecode(parts[3]!);
  const actual = await deriveKey(password, salt, iter, expected.length);
  return timingSafeEqual(actual, expected);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
