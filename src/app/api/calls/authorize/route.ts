import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { jsonError } from "@/lib/api";
import { getEffectivePermissions } from "@/lib/permissions";

export const runtime = "nodejs";

/**
 * Authoritative, server-side "may I be in a voice call in this chat right now?"
 * check. Called before starting/accepting a call AND on every reconnection
 * attempt, so a removed/blocked/suspended participant or an ended room cannot
 * revive a call from an old WebRTC/signaling session.
 *
 * `reason` is a stable code the client maps to a friendly message; it never
 * leaks internal detail.
 */
export async function GET(req: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ ok: false, reason: "SESSION_EXPIRED" }, { status: 200 });

  const url = new URL(req.url);
  const chatId = url.searchParams.get("chatId");
  const feature = url.searchParams.get("feature") === "video" ? "video" : "voice";
  if (!chatId) return jsonError(400, "chatId required");

  if (session.profile.suspended || session.profile.archived) {
    return NextResponse.json({ ok: false, reason: "SESSION_EXPIRED" });
  }

  // Membership + not-blocked/removed + (rooms) active — enforced by the same
  // predicate the message policies use, run under the caller's RLS context.
  const supabase = await supabaseServer();
  const { data: access } = await supabase.rpc("can_access_chat", {
    p_chat: chatId,
    p_user: session.id,
  });
  if (access !== true) {
    return NextResponse.json({ ok: false, reason: "ROOM_ENDED" });
  }

  // If this chat is a room, the requested feature must be enabled at both room
  // and participant level (direct 1-to-1 chats aren't rooms and skip this).
  const admin = supabaseAdmin();
  const { data: chat } = await admin.from("chats").select("type").eq("id", chatId).maybeSingle();
  if (chat?.type === "room") {
    const perms = await getEffectivePermissions(chatId, session.id);
    if (!perms || !perms[feature]) {
      return NextResponse.json({ ok: false, reason: "PERMISSION_REVOKED" });
    }
  }

  return NextResponse.json({ ok: true });
}
