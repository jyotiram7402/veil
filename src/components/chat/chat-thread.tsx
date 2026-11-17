"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/store/chat-store";
import { useChatRealtime } from "@/hooks/use-chat-realtime";
import { useResumeSync } from "@/hooks/use-resume-sync";
import { useVanishOnLeave } from "@/hooks/use-vanish-on-leave";
import { LiveIndicator } from "@/components/chat/live-indicator";
import { MessageList } from "@/components/chat/message-list";
import { Composer } from "@/components/chat/composer";
import { UserAvatar } from "@/components/chat/user-avatar";
import { ChatInfoDrawer } from "@/components/chat/chat-info-drawer";
import { CallButton } from "@/components/call/call-button";
import { usePresenceStore } from "@/store/presence-store";
import { lastSeen } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ChatSummary, MessageWithSender, Profile } from "@/types/chat";

type Props = {
  me: Profile;
  chatId: string;
  chatType: "direct" | "group";
  chatName: string | null;
  chatAvatarUrl: string | null;
  members: Profile[];
  initialMessages: MessageWithSender[];
  initialHasMore: boolean;
  disappearing?: boolean;
};

export function ChatThread({
  me,
  chatId,
  chatType,
  chatName,
  chatAvatarUrl,
  members,
  initialMessages,
  initialHasMore,
  disappearing = false,
}: Props) {
  const setInitial = useChatStore((s) => s.setInitialMessages);
  const messageCount = useChatStore((s) => s.messagesByChat[chatId]?.length ?? 0);
  const markChatRead = useChatStore((s) => s.markChatRead);
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    setInitial(chatId, initialMessages, initialHasMore);
    void fetch(`/api/chats/${chatId}/read`, { method: "POST" });
    markChatRead(chatId, new Date().toISOString());
  }, [chatId, initialMessages, initialHasMore, setInitial, markChatRead]);

  const memberProfiles = useMemo(() => {
    const m: Record<string, Pick<Profile, "id" | "username" | "display_name" | "avatar_url">> = {};
    for (const p of members) {
      m[p.id] = {
        id: p.id,
        username: p.username,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
      };
    }
    return m;
  }, [members]);

  useChatRealtime({ chatId, me, memberProfiles });
  useResumeSync(chatId, me, disappearing);
  const setChats = useChatStore((s) => s.setChats);
  const reloadChatList = useCallback(async () => {
    const res = await fetch("/api/chats", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const body = (await res.json()) as { chats: ChatSummary[] };
    setChats(body.chats);
  }, [setChats]);
  useVanishOnLeave({ chatId, myId: me.id, enabled: disappearing, onGone: reloadChatList });

  const other = chatType === "direct" ? members.find((m) => m.id !== me.id) : null;
  const titleName = chatType === "group" ? (chatName ?? "Group") : (other?.display_name ?? other?.username ?? "Direct message");
  const avatarUrl = chatType === "group" ? chatAvatarUrl : other?.avatar_url ?? null;
  const subtitleUserId = chatType === "direct" ? other?.id ?? null : null;

  const onlineOther = usePresenceStore((s) => (subtitleUserId ? s.online.has(subtitleUserId) : false));

  const subtitle = useMemo(() => {
    if (chatType === "group") {
      return `${members.length} member${members.length === 1 ? "" : "s"}`;
    }
    if (!other) return "";
    if (onlineOther) return "Online";
    return `Last seen ${lastSeen(other.last_seen_at)}`;
  }, [chatType, members.length, other, onlineOther]);

  const lastReadRef = useRef(Date.now());
  const onMessageVisible = useCallback(() => {
    if (Date.now() - lastReadRef.current < 1500) return;
    lastReadRef.current = Date.now();
    void fetch(`/api/chats/${chatId}/read`, { method: "POST" });
    markChatRead(chatId, new Date().toISOString());
  }, [chatId, markChatRead]);

  useEffect(() => {
    if (messageCount === 0) return;
    onMessageVisible();
  }, [messageCount, onMessageVisible]);

  return (
    <div className="flex h-full flex-col chat-bg">
      <header className="flex h-16 shrink-0 items-center gap-1 border-b border-border/70 bg-header px-2 text-header-foreground sm:px-4">
        <Button
          asChild
          size="icon"
          variant="ghost"
          className="md:hidden [&_svg]:size-5"
          aria-label="Back to chats"
        >
          <Link href="/chats">
            <ChevronLeft />
          </Link>
        </Button>
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          aria-label={`${titleName}, chat details`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl py-1 pl-1 pr-2 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <UserAvatar
            userId={subtitleUserId}
            username={titleName}
            displayName={titleName}
            avatarUrl={avatarUrl}
            size="md"
            showPresence={chatType === "direct"}
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-[15px] font-bold leading-tight">
              <span className="truncate">{titleName}</span>
              <LiveIndicator />
            </span>
            <span
              className={cn(
                "block truncate text-xs",
                onlineOther ? "font-medium text-online-ink" : "text-muted-foreground",
              )}
            >
              {subtitle}
            </span>
          </span>
        </button>
        {chatType === "direct" && other && (
          <>
            <CallButton chatId={chatId} mode="video" className="[&_svg]:size-5" />
            <CallButton chatId={chatId} mode="voice" className="[&_svg]:size-5" />
          </>
        )}
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setInfoOpen(true)}
          aria-label="Chat info"
          className="hidden sm:inline-flex [&_svg]:size-5"
        >
          <Info />
        </Button>
      </header>

      <MessageList
        chatId={chatId}
        me={me}
        memberProfiles={memberProfiles}
        disappearing={disappearing}
      />
      <Composer chatId={chatId} me={me} />

      <ChatInfoDrawer
        open={infoOpen}
        onOpenChange={setInfoOpen}
        me={me}
        chatId={chatId}
        chatType={chatType}
        chatName={chatName}
        chatAvatarUrl={chatAvatarUrl}
        members={members}
      />
    </div>
  );
}
