import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Effective-permission model.
 *
 * A feature (chat / voice / video) is authorized for a participant only when
 * EVERY layer agrees:
 *
 *   room status is 'active'
 *   AND participant is not blocked and not removed
 *   AND the room-level feature flag is on
 *   AND the participant-level feature flag is on
 *
 * This is the single source of truth that chat authorization uses today and
 * that the calling layer uses to answer "is this participant authorized
 * for voice/video?" — no caller should re-derive these rules.
 */

export type Feature = "chat" | "voice" | "video";

export type EffectivePermissions = {
  chat: boolean;
  voice: boolean;
  video: boolean;
  roomActive: boolean;
  blocked: boolean;
  removed: boolean;
};

type RoomFlags = {
  status: string;
  chat_enabled: boolean;
  voice_enabled: boolean;
  video_enabled: boolean;
};

type MemberFlags = {
  blocked: boolean;
  removed_at: string | null;
  can_chat: boolean;
  can_voice: boolean;
  can_video: boolean;
};

export function computeEffective(room: RoomFlags, member: MemberFlags): EffectivePermissions {
  const roomActive = room.status === "active";
  const blocked = member.blocked;
  const removed = member.removed_at != null;
  // A LOCKED room keeps its EXISTING participants fully functional (only new
  // joins are refused). ENDED / EXPIRED revoke everything.
  const roomUsable = room.status === "active" || room.status === "locked";
  const usable = roomUsable && !blocked && !removed;
  return {
    chat: usable && room.chat_enabled && member.can_chat,
    voice: usable && room.voice_enabled && member.can_voice,
    video: usable && room.video_enabled && member.can_video,
    roomActive,
    blocked,
    removed,
  };
}

/**
 * Server-side authoritative lookup of a participant's effective permissions in
 * a room. Uses the service-role client so the answer never depends on the
 * caller's RLS context. Returns null when the room isn't a room or the user is
 * not a member of it.
 */
export async function getEffectivePermissions(
  roomId: string,
  userId: string,
): Promise<EffectivePermissions | null> {
  const admin = supabaseAdmin();

  const [{ data: room }, { data: member }] = await Promise.all([
    admin
      .from("chats")
      .select("status, chat_enabled, voice_enabled, video_enabled, type")
      .eq("id", roomId)
      .eq("type", "room")
      .maybeSingle(),
    admin
      .from("chat_members")
      .select("blocked, removed_at, can_chat, can_voice, can_video")
      .eq("chat_id", roomId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (!room || !member) return null;
  return computeEffective(room, member);
}

/**
 * Single boolean authorization check for one feature.
 * e.g. `await authorizeParticipant(roomId, userId, "voice")`.
 */
export async function authorizeParticipant(
  roomId: string,
  userId: string,
  feature: Feature,
): Promise<boolean> {
  const perms = await getEffectivePermissions(roomId, userId);
  return perms ? perms[feature] : false;
}
