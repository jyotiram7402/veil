import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { describeError } from "@/lib/db-errors";
import { takeToken, type Bucket } from "@/lib/token-bucket";

const fallback = new Map<string, Bucket>();
let reported = false;

async function hashKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function reportOnce(error: unknown) {
  if (reported) return;
  reported = true;
  console.error(`[rate-limit] shared limit unavailable, counting on this instance: ${describeError(error)}`);
}

export async function sharedRateLimit(key: string, limit: number, perMs: number): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin().rpc("take_rate_token", {
      p_key: await hashKey(key),
      p_limit: limit,
      p_per_ms: perMs,
    });
    if (!error && typeof data === "boolean") return data;
    reportOnce(error);
  } catch (err) {
    reportOnce(err);
  }
  return takeToken(fallback, key, limit, perMs, Date.now());
}
