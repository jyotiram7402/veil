import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";
import { jsonError, rateLimit } from "@/lib/api";
import { createTurnCredentials } from "@/lib/turn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_ALLOWED = "Calls aren't available right now.";

export async function GET(req: Request) {
  const userId = await getAuthUserId();
  if (!userId) return jsonError(401, "Sign in again to make calls.");

  const chatId = new URL(req.url).searchParams.get("chatId");
  if (chatId && !UUID.test(chatId)) return jsonError(400, NOT_ALLOWED);
  if (!rateLimit(`ice:${userId}`, 30, 60_000)) {
    return jsonError(429, "Too many attempts. Try again in a minute.");
  }

  const supabase = await supabaseServer();
  const [{ data: profile }, inChat, result] = await Promise.all([
    supabase
      .from("profiles")
      .select("is_admin, suspended, archived")
      .eq("id", userId)
      .maybeSingle(),
    chatId
      ? Promise.resolve(
          supabase.rpc("can_access_chat", { p_chat: chatId, p_user: userId }),
        ).then(({ data }) => data === true)
      : null,
    createTurnCredentials(),
  ]);

  if (!profile || profile.suspended || profile.archived) return jsonError(403, NOT_ALLOWED);
  if (chatId ? !inChat : !profile.is_admin) return jsonError(chatId ? 403 : 400, NOT_ALLOWED);

  if (!result.ok) {
    return NextResponse.json({
      relay: false,
      iceServers: [],
      ...(profile.is_admin ? { reason: result.reason } : {}),
    });
  }
  return NextResponse.json({ relay: true, iceServers: result.iceServers });
}
