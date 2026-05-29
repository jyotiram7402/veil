"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, Loader2 } from "lucide-react";
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

const NEAR_BOTTOM_PX = 240;

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
  const [nearBottom, setNearBottom] = useState(true);
  const [unseenCount, setUnseenCount] = useState(0);
  const prevHeightRef = useRef(0);
  const prevCountRef = useRef(0);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const isFirst = prevCountRef.current === 0;
    const wasNearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;

    if (isFirst) {
      el.scrollTop = el.scrollHeight;
    } else if (messages.length > prevCountRef.current) {
      const grew = messages.length - prevCountRef.current;
      if (grew > 1 && prevHeightRef.current > 0) {
        // History pull: preserve viewport.
        el.scrollTop = el.scrollHeight - prevHeightRef.current;
        prevHeightRef.current = 0;
      } else if (wasNearBottom) {
        // We were already at the bottom — keep us pinned.
        el.scrollTop = el.scrollHeight;
      } else {
        // New message arrived while user was reading older messages — count it.
        const incoming = messages.slice(prevCountRef.current);
        const fromOthers = incoming.filter(
          (m) => m.sender_id && m.sender_id !== me.id,
        ).length;
        if (fromOthers > 0) setUnseenCount((n) => n + fromOthers);
      }
    }

    prevCountRef.current = messages.length;
  }, [messages, me.id]);

  // Track whether we're near the bottom; controls visibility of the pill.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const isNear =
        el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
      setNearBottom(isNear);
      if (isNear) setUnseenCount(0);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

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
    <div className="relative flex-1 min-h-0">
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-y-auto px-3 sm:px-6 py-4"
      >
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
            const sender =
              m.sender ?? (m.sender_id ? memberProfiles[m.sender_id] : null) ?? null;
            const prevFromSame =
              !!prev &&
              prev.sender_id === m.sender_id &&
              isSameDay(prev.created_at, m.created_at);
            const nextFromSame =
              !!next &&
              next.sender_id === m.sender_id &&
              isSameDay(next.created_at, m.created_at);

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
                  readByOther={false}
                  canDeleteAny={me.is_admin}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* "New messages" pill — visible only when scrolled up. */}
      {!nearBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom("smooth")}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg hover:scale-105 active:scale-95 transition-transform"
        >
          <ArrowDown className="h-3.5 w-3.5" />
          {unseenCount > 0 ? `${unseenCount} new` : "Scroll to bottom"}
        </button>
      )}
    </div>
  );
}
