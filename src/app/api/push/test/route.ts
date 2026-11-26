import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUserId } from "@/lib/auth/session";
import { clientKey, jsonError, parseBody, rateLimit } from "@/lib/api";
import { sendTestPush } from "@/lib/push";

export const runtime = "nodejs";

const testSchema = z.object({ endpoint: z.string().min(1).max(2000) });

export async function POST(req: Request) {
  const userId = await getAuthUserId();
  if (!userId) return jsonError(401, "Sign in required");

  if (!rateLimit(`push-test:${userId}:${clientKey(req)}`, 5, 60_000)) {
    return jsonError(429, "Too many tests. Try again in a minute.");
  }

  const parsed = await parseBody(req, testSchema);
  if (!parsed.ok) return parsed.response;

  const result = await sendTestPush(userId, parsed.data.endpoint, new URL(req.url).origin);
  return NextResponse.json({ result });
}
