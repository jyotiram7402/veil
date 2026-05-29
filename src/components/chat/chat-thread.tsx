"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/store/chat-store";
import { useChatRealtime } from "@/hooks/use-chat-realtime";
import { MessageList } from "@/components/chat/message-list";
import { Composer } from "@/components/chat/composer";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import { UserAvatar } from "@/components/chat/user-avatar";
import { ChatInfoDrawer } from "@/components/chat/chat-info-drawer";
import { usePresenceStore } from "@/store/presence-store";
import { lastSeen } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MessageWithSender, Profile } from "@/types/chat";

type Props = {
  me: Profile;
  chatId: string;
  chatType: "direct" | "group";
  chatName: string | null;
  chatAvatarUrl: string | null;
  members: Profile[];
  initialMessages: MessageWithSender[];
  initialHasMore: boolean;
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
}: Props) {
  const setInitial = useChatStore((s) => s.setInitialMessages);
  const messages = useChatStore((s) => s.messagesByChat[chatId] ?? []);
  const markChatRead = useChatStore((s) => s.markChatRead);
  const [infoOpen, setInfoOpen] = useState(false);

  // hydrate the store with the SSR-rendered initial page
  useEffect(() => {
    setInitial(chatId, initialMessages, initialHasMore);
    // tell server we've read up to now
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
    if (onlineOther) return "online";
    return `last seen ${lastSeen(other.last_seen_at)}`;
  }, [chatType, members.length, other, onlineOther]);

  // when a new message arrives while we're viewing the chat, keep last_read fresh
  const lastReadRef = useRef(Date.now());
  const onMessageVisible = useCallback(() => {
    if (Date.now() - lastReadRef.current < 1500) return;
    lastReadRef.current = Date.now();
    void fetch(`/api/chats/${chatId}/read`, { method: "POST" });
    markChatRead(chatId, new Date().toISOString());
  }, [chatId, markChatRead]);

  useEffect(() => {
    if (messages.length === 0) return;
    onMessageVisible();
  }, [messages.length, onMessageVisible]);

  return (
    <div className="flex h-full flex-col">
      <header
        className={cn(
          "flex h-14 items-center gap-3 border-b border-border/60 px-3",
          "bg-card/40 backdrop-blur",
        )}
      >
        <Button
          asChild
          size="icon"
          variant="ghost"
          className="md:hidden"
          aria-label="Back to chats"
        >
          <Link href="/chats">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <UserAvatar
          userId={subtitleUserId}
          username={titleName}
          displayName={titleName}
          avatarUrl={avatarUrl}
          size="md"
          showPresence={chatType === "direct"}
        />
        <button
          onClick={() => setInfoOpen(true)}
          className="flex flex-1 min-w-0 flex-col items-start text-left"
        >
          <span className="text-sm font-medium leading-tight truncate w-full">{titleName}</span>
          <span className="text-[11px] text-muted-foreground truncate w-full">{subtitle}</span>
        </button>
        <Button size="icon" variant="ghost" onClick={() => setInfoOpen(true)} aria-label="Chat info">
          <Info className="h-5 w-5" />
        </Button>
      </header>

      <MessageList chatId={chatId} me={me} memberProfiles={memberProfiles} />
      <TypingIndicator chatId={chatId} />
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
