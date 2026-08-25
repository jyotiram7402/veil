import { redirect } from "next/navigation";
import { requireSessionUser } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";
import { loadMessagesPage } from "@/lib/queries";
import { MESSAGE_PAGE_SIZE } from "@/lib/constants";
import { effectiveSettingsForUser } from "@/lib/settings";
import { RoomChat } from "@/components/rooms/room-chat";
import { RoomClosed } from "@/components/rooms/room-closed";
import type { Profile } from "@/types/chat";

export const dynamic = "force-dynamic";

type MemberRow = {
  user_id: string;
  role: "admin" | "member";
  blocked: boolean;
  removed_at: string | null;
  can_chat: boolean;
  can_voice: boolean;
  can_video: boolean;
  user: Pick<Profile, "id" | "username" | "display_name" | "avatar_url"> | null;
};

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSessionUser();
  const supabase = await supabaseServer();

  // RLS ("chats select if member") returns the row only to members.
  const { data: room } = await supabase
    .from("chats")
    .select(
      `
        id, name, type, status, chat_enabled, voice_enabled, video_enabled,
        members:chat_members(
          user_id, role, blocked, removed_at, can_chat, can_voice, can_video,
          user:profiles(id, username, display_name, avatar_url)
        )
      `,
    )
    .eq("id", id)
    .eq("type", "room")
    .maybeSingle();

  if (!room) redirect("/join");

  const members = (room.members ?? []) as unknown as MemberRow[];
  const mine = members.find((m) => m.user_id === session.id);
  if (!mine) redirect("/join");

  if (mine.blocked || mine.removed_at) {
    return <RoomClosed title="You have been removed from this room." message="You no longer have access to this room." />;
  }
  // Locked rooms keep existing participants connected — only ended/expired
  // rooms are closed here (new joins are refused at the join endpoint).
  if (room.status === "ended" || room.status === "expired") {
    return <RoomClosed title="This room is no longer available." message="This room has ended." />;
  }

  const memberProfiles: Record<
    string,
    Pick<Profile, "id" | "username" | "display_name" | "avatar_url">
  > = {};
  for (const m of members) {
    if (m.user) memberProfiles[m.user.id] = m.user;
  }

  const initialMessages = await loadMessagesPage(supabase, id, { limit: MESSAGE_PAGE_SIZE });

  await supabase
    .from("chat_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("chat_id", id)
    .eq("user_id", session.id);

  const settings = await effectiveSettingsForUser(session.id);

  return (
    <RoomChat
      me={session.profile}
      roomId={id}
      roomName={room.name ?? "Private room"}
      locked={room.status === "locked"}
      roomChatEnabled={room.chat_enabled}
      roomVoiceEnabled={room.voice_enabled}
      roomVideoEnabled={room.video_enabled}
      canChat={mine.can_chat}
      canVoice={mine.can_voice}
      canVideo={mine.can_video}
      memberProfiles={memberProfiles}
      participantCount={
        members.filter((m) => m.role === "member" && !m.blocked && !m.removed_at).length
      }
      initialMessages={initialMessages}
      initialHasMore={initialMessages.length === MESSAGE_PAGE_SIZE}
      settings={settings}
    />
  );
}
