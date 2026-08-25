import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { clientKey, jsonError, parseBody, rateLimit } from "@/lib/api";
import { createRoomSchema } from "@/lib/validations";
import { expiryFromMinutes, recordAudit } from "@/lib/rooms";

export const runtime = "nodejs";

/** GET — list the rooms this admin manages, with counts. */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  const admin = supabaseAdmin();
  const { data: rooms, error } = await admin
    .from("chats")
    .select(
      "id, name, status, created_at, expires_at, ended_at, max_participants, chat_enabled, voice_enabled, video_enabled",
    )
    .eq("type", "room")
    .eq("created_by", session.id)
    .order("created_at", { ascending: false });
  if (error) return jsonError(500, error.message);

  const ids = (rooms ?? []).map((r) => r.id);
  const participants = new Map<string, number>();
  const invites = new Map<string, number>();
  const expiringInvites = new Map<string, number>();

  if (ids.length > 0) {
    const { data: members } = await admin
      .from("chat_members")
      .select("chat_id, role, blocked, removed_at")
      .in("chat_id", ids);
    for (const m of members ?? []) {
      if (m.role === "member" && !m.blocked && !m.removed_at) {
        participants.set(m.chat_id, (participants.get(m.chat_id) ?? 0) + 1);
      }
    }

    const { data: inv } = await admin
      .from("room_invites")
      .select("room_id, revoked_at, expires_at")
      .in("room_id", ids)
      .is("revoked_at", null);
    const now = Date.now();
    const soon = now + 60 * 60_000; // "expiring" = within the next hour
    for (const i of inv ?? []) {
      const exp = i.expires_at ? new Date(i.expires_at).getTime() : null;
      if (exp === null || exp > now) {
        invites.set(i.room_id, (invites.get(i.room_id) ?? 0) + 1);
        if (exp !== null && exp <= soon) {
          expiringInvites.set(i.room_id, (expiringInvites.get(i.room_id) ?? 0) + 1);
        }
      }
    }
  }

  return NextResponse.json({
    rooms: (rooms ?? []).map((r) => ({
      ...r,
      participant_count: participants.get(r.id) ?? 0,
      active_invite_count: invites.get(r.id) ?? 0,
      expiring_invite_count: expiringInvites.get(r.id) ?? 0,
    })),
  });
}

/** POST — create a room (a chats row of type='room') owned by the admin. */
export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");
  if (!rateLimit(`room-create:${clientKey(req)}`, 30, 60_000)) {
    return jsonError(429, "Slow down");
  }

  const parsed = await parseBody(req, createRoomSchema);
  if (!parsed.ok) return parsed.response;
  const { name, chatEnabled, voiceEnabled, videoEnabled, maxParticipants, expiresInMinutes } =
    parsed.data;

  const admin = supabaseAdmin();
  const { data: room, error } = await admin
    .from("chats")
    .insert({
      type: "room",
      name,
      created_by: session.id,
      status: "active",
      chat_enabled: chatEnabled ?? true,
      voice_enabled: voiceEnabled ?? false,
      video_enabled: videoEnabled ?? false,
      max_participants: maxParticipants ?? null,
      expires_at: expiryFromMinutes(expiresInMinutes),
    })
    .select("id")
    .single();
  if (error || !room) return jsonError(500, error?.message ?? "Could not create room");

  const { error: memberErr } = await admin
    .from("chat_members")
    .insert({ chat_id: room.id, user_id: session.id, role: "admin" });
  if (memberErr) {
    await admin.from("chats").delete().eq("id", room.id);
    return jsonError(500, memberErr.message);
  }

  await recordAudit({
    roomId: room.id,
    actorId: session.id,
    action: "room_created",
    meta: { name },
  });

  return NextResponse.json({ ok: true, roomId: room.id });
}
