import { headers } from "next/headers";
import { env } from "@/lib/env";

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
  } catch {}
  return fromEnv ?? "http://localhost:3000";
}

export async function inviteUrlFor(token: string): Promise<string> {
  const origin = await appOrigin();
  return `${origin}/i/${token}`;
}
