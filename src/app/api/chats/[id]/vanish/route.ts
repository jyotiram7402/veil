import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";
import { jsonError, parseBody, rateLimit } from "@/lib/api";
import { vanishSchema } from "@/lib/validations";
import { chatIsDisappearing, deleteReadMessages } from "@/lib/vanish";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId();
  if (!userId) return jsonError(401, "Sign in required");

  const { id: chatId } = await ctx.params;
  if (!UUID.test(chatId)) return jsonError(400, "Unknown chat");
  if (!rateLimit(`vanish:${userId}`, 60, 60_000)) return jsonError(429, "Too many requests");

  const parsed = await parseBody(req, vanishSchema);
  if (!parsed.ok) return parsed.response;

  const supabase = await supabaseServer();
  const [{ data: access }, disappearing] = await Promise.all([
    supabase.rpc("can_access_chat", { p_chat: chatId, p_user: userId }),
    chatIsDisappearing(chatId),
  ]);
  if (access !== true) return jsonError(403, "Not allowed");

  if (!disappearing) {
    return NextResponse.json({ ok: true, deleted: 0, more: false });
  }

  try {
    const { deleted, more } = await deleteReadMessages(chatId, userId, parsed.data.upTo);
    return NextResponse.json({ ok: true, deleted, more });
  } catch {
    return jsonError(500, "Something went wrong");
  }
}
