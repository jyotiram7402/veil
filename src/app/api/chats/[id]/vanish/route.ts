import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";
import { jsonError, parseBody, rateLimit } from "@/lib/api";
import { vanishSchema } from "@/lib/validations";
import { chatIsDisappearing, deleteReadMessages } from "@/lib/vanish";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/chats/[id]/vanish   { upTo: ISO time }
 *
 * "I am leaving this chat, and I had read everything up to `upTo`." Where the
 * admin has switched disappearing messages on, the messages that were sent to
 * the caller up to that moment are deleted for good (see src/lib/vanish.ts).
 *
 * The caller can only ever make messages disappear that were sent to them, in
 * a chat they are in. Sent by the browser as the page goes away, so it answers
 * quietly whatever happens.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId();
  if (!userId) return jsonError(401, "Sign in required");

  const { id: chatId } = await ctx.params;
  if (!UUID.test(chatId)) return jsonError(400, "Unknown chat");
  if (!rateLimit(`vanish:${userId}`, 60, 60_000)) return jsonError(429, "Too many requests");

  const parsed = await parseBody(req, vanishSchema);
  if (!parsed.ok) return parsed.response;

  // Only someone who is in the chat (same check the message policies use).
  const supabase = await supabaseServer();
  const [{ data: access }, disappearing] = await Promise.all([
    supabase.rpc("can_access_chat", { p_chat: chatId, p_user: userId }),
    chatIsDisappearing(chatId),
  ]);
  if (access !== true) return jsonError(403, "Not allowed");

  // And only where the admin has switched it on.
  if (!disappearing) {
    return NextResponse.json({ ok: true, deleted: 0, more: false });
  }

  try {
    // `more`: a very long history goes in several requests; the screen asks again.
    const { deleted, more } = await deleteReadMessages(chatId, userId, parsed.data.upTo);
    return NextResponse.json({ ok: true, deleted, more });
  } catch {
    return jsonError(500, "Something went wrong");
  }
}
