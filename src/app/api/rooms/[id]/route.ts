import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError, parseBody } from "@/lib/api";
import { updateRoomSchema } from "@/lib/validations";
import { assertRoomAdmin, recordAudit } from "@/lib/rooms";

export const runtime = "nodejs";

function inviteView(row: {
  id: string;
  label: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  max_uses: number | null;
  use_count: number;
  last_used_at: string | null;
}) {
  const now = Date.now();
  const expired = !!row.expires_at && new Date(row.expires_at).getTime() <= now;
  const exhausted = row.max_uses != null && row.use_count >= row.max_uses;
  const status = row.revoked_at
    ? "revoked"
    : expired
      ? "expired"
      : exhausted
        ? "used"
        : "active";
  // Note: the raw token/selector is intentionally never returned here.
  return {
    id: row.id,
    label: row.label,
    created_at: row.created_at,
    expires_at: row.expires_at,
    revoked_at: row.revoked_at,
    max_uses: row.max_uses,
    use_count: row.use_count,
    last_used_at: row.last_used_at,
    status,
  };
}

/** GET — room detail with participants and invitations. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  const { id } = await ctx.params;

  const room = await assertRoomAdmin(id, session.id, session.profile.is_admin);
  if (!room) return jsonError(403, "Not authorized for this room");

  const admin = supabaseAdmin();

  const { data: members } = await admin
    .from("chat_members")
    .select(
      "user_id, role, blocked, removed_at, can_chat, can_voice, can_video, joined_at, user:profiles(id, username, display_name, avatar_url, last_seen_at, is_room_guest)",
    )
    .eq("chat_id", id);

  const { data: invites } = await admin
    .from("room_invites")
    .select("id, label, created_at, expires_at, revoked_at, max_uses, use_count, last_used_at")
    .eq("room_id", id)
    .order("created_at", { ascending: false });

  return NextResponse.json({
    room,
    participants: (members ?? [])
      .filter((m) => m.role === "member")
      .map((m) => ({
        user_id: m.user_id,
        blocked: m.blocked,
        removed_at: m.removed_at,
        can_chat: m.can_chat,
        can_voice: m.can_voice,
        can_video: m.can_video,
        joined_at: m.joined_at,
        status: m.removed_at ? "removed" : m.blocked ? "blocked" : "active",
        user: m.user,
      })),
    invites: (invites ?? []).map(inviteView),
  });
}

/** PATCH — update permissions / rename / change status (end, lock, reopen). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  const { id } = await ctx.params;

  const room = await assertRoomAdmin(id, session.id, session.profile.is_admin);
  if (!room) return jsonError(403, "Not authorized for this room");

  const parsed = await parseBody(req, updateRoomSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.chatEnabled !== undefined) patch.chat_enabled = body.chatEnabled;
  if (body.voiceEnabled !== undefined) patch.voice_enabled = body.voiceEnabled;
  if (body.videoEnabled !== undefined) patch.video_enabled = body.videoEnabled;
  if (body.maxParticipants !== undefined) patch.max_participants = body.maxParticipants;
  if (body.status !== undefined) {
    patch.status = body.status;
    patch.ended_at = body.status === "ended" ? new Date().toISOString() : null;
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

  const admin = supabaseAdmin();
  const { error } = await admin.from("chats").update(patch).eq("id", id).eq("type", "room");
  if (error) return jsonError(500, error.message);

  // Ending a room invalidates every outstanding invitation immediately.
  if (body.status === "ended") {
    await admin
      .from("room_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("room_id", id)
      .is("revoked_at", null);
    await recordAudit({ roomId: id, actorId: session.id, action: "room_ended" });
  } else if (body.status === "locked") {
    await recordAudit({ roomId: id, actorId: session.id, action: "room_locked" });
  } else {
    await recordAudit({
      roomId: id,
      actorId: session.id,
      action: "room_updated",
      meta: { fields: Object.keys(patch) },
    });
  }

  return NextResponse.json({ ok: true });
}
