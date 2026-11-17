import { NextResponse, after } from "next/server";
import { z } from "zod";
import { getAuthUserId } from "@/lib/auth/session";
import { clientKey, jsonError, parseBody, rateLimit } from "@/lib/api";
import { notifyIncomingCall } from "@/lib/push";

export const runtime = "nodejs";

const callIdSchema = z.string().uuid();

const bodySchema = z.object({
  chatId: z.string().uuid(),
  kind: z.enum(["voice", "video"]).default("voice"),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId();
  if (!userId) return jsonError(401, "Sign in required");
  const { id } = await ctx.params;
  if (!callIdSchema.safeParse(id).success) return jsonError(400, "Bad request");

  if (!rateLimit(`ring:${userId}:${clientKey(req)}`, 10, 60_000)) {
    return jsonError(429, "Too many calls");
  }

  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;

  const origin = new URL(req.url).origin;
  const call = {
    callId: id,
    chatId: parsed.data.chatId,
    callerId: userId,
    kind: parsed.data.kind,
  };
  after(() => notifyIncomingCall(call, origin));
  return NextResponse.json({ ok: true });
}
