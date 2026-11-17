import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { jsonError } from "@/lib/api";
import { getEffectivePermissions } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ ok: false, reason: "SESSION_EXPIRED" }, { status: 200 });

  const url = new URL(req.url);
  const chatId = url.searchParams.get("chatId");
  const feature = url.searchParams.get("feature") === "video" ? "video" : "voice";
  if (!chatId) return jsonError(400, "chatId required");

  const supabase = await supabaseServer();
  const [{ data: profile }, { data: access }, { data: chat }] = await Promise.all([
    supabase.from("profiles").select("suspended, archived").eq("id", userId).maybeSingle(),
    supabase.rpc("can_access_chat", { p_chat: chatId, p_user: userId }),
    supabaseAdmin().from("chats").select("type").eq("id", chatId).maybeSingle(),
  ]);

  if (!profile || profile.suspended || profile.archived) {
    return NextResponse.json({ ok: false, reason: "SESSION_EXPIRED" });
  }

  if (access !== true) {
    return NextResponse.json({ ok: false, reason: "ROOM_ENDED" });
  }

  if (chat?.type === "room") {
    const perms = await getEffectivePermissions(chatId, userId);
    if (!perms || !perms[feature]) {
      return NextResponse.json({ ok: false, reason: "PERMISSION_REVOKED" });
    }
  }

  return NextResponse.json({ ok: true });
}
