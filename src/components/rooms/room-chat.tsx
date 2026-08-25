"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, LogOut, Mic, Users, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MessageList } from "@/components/chat/message-list";
import { Composer } from "@/components/chat/composer";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import { ThemeToggle } from "@/components/theme-toggle";
import { LiveIndicator } from "@/components/chat/live-indicator";
import { RoomClosed } from "@/components/rooms/room-closed";
import { useChatRealtime } from "@/hooks/use-chat-realtime";
import { useResumeSync } from "@/hooks/use-resume-sync";
import { usePresence } from "@/hooks/use-presence";
import { useTypingPrune } from "@/hooks/use-typing-prune";
import { useChatStore } from "@/store/chat-store";
import { useSessionStore } from "@/store/session-store";
import { usePresenceStore } from "@/store/presence-store";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { SettingsShape } from "@/lib/settings";
import type { MessageWithSender, Profile } from "@/types/chat";

type ClosedReason = { title: string; message: string } | null;

export function RoomChat({
  me,
  roomId,
  roomName,
  locked: initialLocked,
  roomChatEnabled,
  roomVoiceEnabled,
  roomVideoEnabled,
  canChat,
  canVoice,
  canVideo,
  memberProfiles,
  participantCount,
  initialMessages,
  initialHasMore,
  settings,
}: {
  me: Profile;
  roomId: string;
  roomName: string;
  locked: boolean;
  roomChatEnabled: boolean;
  roomVoiceEnabled: boolean;
  roomVideoEnabled: boolean;
  canChat: boolean;
  canVoice: boolean;
  canVideo: boolean;
  memberProfiles: Record<string, Pick<Profile, "id" | "username" | "display_name" | "avatar_url">>;
  participantCount: number;
  initialMessages: MessageWithSender[];
  initialHasMore: boolean;
  settings: SettingsShape;
}) {
  const router = useRouter();
  const setInitial = useChatStore((s) => s.setInitialMessages);
  const setProfile = useSessionStore((s) => s.setProfile);

  // Live, admin-driven state (kept in sync via realtime below).
  const [locked, setLocked] = useState(initialLocked);
  const [roomChatOn, setRoomChatOn] = useState(roomChatEnabled);
  const [roomVoiceOn, setRoomVoiceOn] = useState(roomVoiceEnabled);
  const [roomVideoOn, setRoomVideoOn] = useState(roomVideoEnabled);
  const [myChatOn, setMyChatOn] = useState(canChat);
  const [myVoiceOn, setMyVoiceOn] = useState(canVoice);
  const [myVideoOn, setMyVideoOn] = useState(canVideo);
  const [closed, setClosed] = useState<ClosedReason>(null);

  useEffect(() => setProfile(me), [me, setProfile]);
  useEffect(() => {
    setInitial(roomId, initialMessages, initialHasMore);
  }, [roomId, initialMessages, initialHasMore, setInitial]);

  usePresence(me);
  useTypingPrune();
  useChatRealtime({ chatId: roomId, me, memberProfiles });
  useResumeSync(roomId, me);

  // Reflect admin changes (lock/unlock/end + room & personal permissions +
  // block/remove) without a page refresh.
  useEffect(() => {
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`room-state:${roomId}:${me.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chats", filter: `id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as {
            status?: string;
            chat_enabled?: boolean;
            voice_enabled?: boolean;
            video_enabled?: boolean;
          };
          if (row.status === "ended" || row.status === "expired") {
            setClosed({ title: "This room is no longer available.", message: "This room has ended." });
          }
          if (row.status) setLocked(row.status === "locked");
          if (typeof row.chat_enabled === "boolean") setRoomChatOn(row.chat_enabled);
          if (typeof row.voice_enabled === "boolean") setRoomVoiceOn(row.voice_enabled);
          if (typeof row.video_enabled === "boolean") setRoomVideoOn(row.video_enabled);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_members", filter: `chat_id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as {
            user_id?: string;
            blocked?: boolean;
            removed_at?: string | null;
            can_chat?: boolean;
            can_voice?: boolean;
            can_video?: boolean;
          };
          if (row.user_id !== me.id) return;
          if (row.blocked || row.removed_at) {
            setClosed({
              title: "You have been removed from this room.",
              message: "You no longer have access to this room.",
            });
          }
          if (typeof row.can_chat === "boolean") setMyChatOn(row.can_chat);
          if (typeof row.can_voice === "boolean") setMyVoiceOn(row.can_voice);
          if (typeof row.can_video === "boolean") setMyVideoOn(row.can_video);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, me.id]);

  // Presence: how many room members are currently online (never used for auth).
  const online = usePresenceStore((s) => s.online);
  const onlineCount = useMemo(
    () => Object.keys(memberProfiles).filter((id) => online.has(id)).length,
    [memberProfiles, online],
  );

  async function leave() {
    if (!confirm("Leave this room?")) return;
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/join");
  }

  if (closed) {
    return <RoomClosed title={closed.title} message={closed.message} />;
  }

  // Effective permissions (mirror of the server-side model in lib/permissions).
  const chatOn = roomChatOn && myChatOn;
  const voiceEffective = roomVoiceOn && myVoiceOn;
  const videoEffective = roomVideoOn && myVideoOn;

  return (
    <div className="flex h-screen-mobile flex-col chat-bg">
      <header
        className="flex h-14 items-center gap-3 px-3 bg-header text-header-foreground"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="grid h-9 w-9 place-items-center rounded-full bg-white/15 shrink-0">
          <Users className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate flex items-center gap-2">
            {roomName}
            {locked && <Lock className="h-3.5 w-3.5 opacity-80" aria-label="Room locked" />}
            <LiveIndicator />
          </div>
          <div className="text-[11px] opacity-80 truncate">
            {onlineCount > 0 && `${onlineCount} online · `}
            {participantCount === 1 ? "1 participant" : `${participantCount} participants`}
          </div>
        </div>

        {/* Reserved voice/video controls — disabled placeholders for .
            No microphone/camera access is requested. */}
        <CallControl kind="voice" allowed={voiceEffective} />
        <CallControl kind="video" allowed={videoEffective} />

        <ThemeToggle />
        <Button
          size="icon"
          variant="ghost"
          onClick={leave}
          aria-label="Leave room"
          className="text-current hover:bg-white/10"
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </header>

      <MessageList chatId={roomId} me={me} memberProfiles={memberProfiles} />
      {settings.typing_indicator ? <TypingIndicator chatId={roomId} /> : <div className="h-5" />}

      {chatOn ? (
        <Composer
          chatId={roomId}
          me={me}
          uploadsEnabled={settings.uploads_enabled}
          maxLength={settings.max_message_length}
        />
      ) : (
        <div className="px-4 py-3 text-center text-xs text-muted-foreground border-t border-border/60 bg-background/60">
          Chat has been disabled by the room administrator.
        </div>
      )}
    </div>
  );
}

/**
 * Placeholder call control. Reserves the header slot and reflects the
 * effective permission, but is always disabled in (no WebRTC / no
 * media access). Hidden entirely when the feature is not authorized.
 */
function CallControl({ kind, allowed }: { kind: "voice" | "video"; allowed: boolean }) {
  const Icon = kind === "voice" ? Mic : Video;
  const label = kind === "voice" ? "Voice" : "Video";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Button
            size="icon"
            variant="ghost"
            disabled
            aria-label={allowed ? `${label} (coming soon)` : `${label} unavailable`}
            className={cn("text-current", !allowed && "opacity-30")}
          >
            <Icon className="h-5 w-5" />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{allowed ? `${label} — coming soon` : `${label} unavailable`}</TooltipContent>
    </Tooltip>
  );
}
