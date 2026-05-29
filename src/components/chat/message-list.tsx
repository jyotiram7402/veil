"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { MessageBubble } from "@/components/chat/message-bubble";
import { useChatStore } from "@/store/chat-store";
import { dayLabel } from "@/lib/format";
import { MESSAGE_PAGE_SIZE } from "@/lib/constants";
import type { MessageWithSender, Profile } from "@/types/chat";

function isSameDay(a: string, b: string) {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}

export function MessageList({
  chatId,
  me,
  memberProfiles,
}: {
  chatId: string;
  me: Profile;
  memberProfiles: Record<string, Pick<Profile, "id" | "username" | "display_name" | "avatar_url">>;
}) {
  const messages = useChatStore((s) => s.messagesByChat[chatId] ?? []);
  const hasMore = useChatStore((s) => s.hasMore[chatId] ?? false);
  const prependMessages = useChatStore((s) => s.prependMessages);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const prevHeightRef = useRef(0);

  // Snap to bottom on first paint, and any time the message count changes from
  // a new (not paged-in) message at the bottom.
  const prevCountRef = useRef(0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const isFirst = prevCountRef.current === 0;
    const wasNearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 200;

    if (isFirst) {
      el.scrollTop = el.scrollHeight;
    } else if (messages.length > prevCountRef.current) {
      const grew = messages.length - prevCountRef.current;
      // history pull adds at the top; preserve viewport
      if (grew > 1 && prevHeightRef.current > 0) {
        el.scrollTop = el.scrollHeight - prevHeightRef.current;
        prevHeightRef.current = 0;
      } else if (wasNearBottom) {
        el.scrollTop = el.scrollHeight;
      }
    }

    prevCountRef.current = messages.length;
  }, [messages.length]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore || messages.length === 0) return;
    setLoadingOlder(true);
    const oldest = messages[0]!;
    const el = scrollRef.current;
    if (el) prevHeightRef.current = el.scrollHeight;
    try {
      const url = new URL(`/api/chats/${chatId}/messages`, window.location.origin);
      url.searchParams.set("before", oldest.created_at);
      url.searchParams.set("limit", `${MESSAGE_PAGE_SIZE}`);
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { messages: MessageWithSender[]; hasMore: boolean };
      prependMessages(chatId, body.messages, body.hasMore);
    } finally {
      setLoadingOlder(false);
    }
  }, [chatId, hasMore, loadingOlder, messages, prependMessages]);

  // Auto-trigger load-older when the sentinel enters view
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root) return;

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadOlder();
      },
      { root, rootMargin: "120px" },
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [loadOlder]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-6 py-4">
      <div ref={sentinelRef} className="h-1" />
      {loadingOlder && (
        <div className="flex justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      <div className="space-y-1">
        {messages.map((m, i) => {
          const prev = i > 0 ? messages[i - 1]! : null;
          const next = i < messages.length - 1 ? messages[i + 1]! : null;
          const showDay = !prev || !isSameDay(prev.created_at, m.created_at);
          const fromMe = m.sender_id === me.id;
          const sender = m.sender ?? (m.sender_id ? memberProfiles[m.sender_id] : null) ?? null;
          const prevFromSame =
            !!prev && prev.sender_id === m.sender_id && isSameDay(prev.created_at, m.created_at);
          const nextFromSame =
            !!next && next.sender_id === m.sender_id && isSameDay(next.created_at, m.created_at);

          return (
            <div key={m.id}>
              {showDay && (
                <div className="my-4 flex items-center justify-center">
                  <span className="rounded-full bg-card/70 backdrop-blur border border-border/60 px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {dayLabel(m.created_at)}
                  </span>
                </div>
              )}
              <MessageBubble
                message={m}
                sender={sender}
                fromMe={fromMe}
                showSender={!fromMe && !prevFromSame}
                groupedTop={prevFromSame}
                groupedBottom={nextFromSame}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
