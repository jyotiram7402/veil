import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

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
