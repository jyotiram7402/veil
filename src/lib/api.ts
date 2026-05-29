import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";

export function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<
  { ok: true; data: T } | { ok: false; response: NextResponse }
> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: jsonError(400, "Invalid JSON body") };
  }
  try {
    const data = schema.parse(raw);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        ok: false,
        response: jsonError(422, "Validation failed", { issues: err.flatten() }),
      };
    }
    return { ok: false, response: jsonError(400, "Bad request") };
  }
}

/** Crude in-memory token bucket for soft rate-limiting per route + key. */
const buckets = new Map<string, { tokens: number; updated: number }>();

export function rateLimit(key: string, limit = 30, perMs = 60_000): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b) {
    buckets.set(key, { tokens: limit - 1, updated: now });
    return true;
  }
  const refill = ((now - b.updated) / perMs) * limit;
  const tokens = Math.min(limit, b.tokens + refill);
  if (tokens < 1) {
    b.tokens = tokens;
    b.updated = now;
    return false;
  }
  b.tokens = tokens - 1;
  b.updated = now;
  return true;
}

export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "anon";
}
