import { NextResponse } from "next/server";
import { ZodError, type ZodType, type ZodTypeDef } from "zod";
import { describeError } from "@/lib/db-errors";
import { takeToken, type Bucket } from "@/lib/token-bucket";

export function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function serverError(area: string, error: unknown, message: string) {
  console.error(`[${area}] ${describeError(error)}`);
  return jsonError(500, message);
}

export async function parseBody<T>(req: Request, schema: ZodType<T, ZodTypeDef, unknown>): Promise<
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

const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit = 30, perMs = 60_000): boolean {
  return takeToken(buckets, key, limit, perMs, Date.now());
}

export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "anon";
}
