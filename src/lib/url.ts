import { headers } from "next/headers";
import { env } from "@/lib/env";

/**
 * Resolve the canonical app origin at runtime. Priority:
 *   1. NEXT_PUBLIC_APP_URL env var (if it doesn't look like a localhost default)
 *   2. The current request's x-forwarded-host / host header
 *   3. The env value as last resort (may be localhost)
 *
 * This makes invite links work on Vercel even if the env var was never set.
 */
export async function appOrigin(): Promise<string> {
  const fromEnv = env.APP_URL?.replace(/\/$/, "");
  const looksLikeProd =
    fromEnv && !/^https?:\/\/localhost/.test(fromEnv) && !/^http:\/\/127\./.test(fromEnv);
  if (looksLikeProd) return fromEnv;

  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // headers() can throw when called outside a request context; fall through
  }
  return fromEnv ?? "http://localhost:3000";
}

export async function inviteUrlFor(token: string): Promise<string> {
  const origin = await appOrigin();
  return `${origin}/i/${token}`;
}
