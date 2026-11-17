"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Loader2, Timer } from "lucide-react";
import { MessageBubble } from "@/components/chat/message-bubble";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import { useChatStore } from "@/store/chat-store";
import { dayLabel } from "@/lib/format";
import { MESSAGE_PAGE_SIZE } from "@/lib/constants";
import { cn } from "@/lib/utils";
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
const NO_MESSAGES: MessageWithSender[] = [];

export function MessageList({
  chatId,
  me,
  memberProfiles,
  showTyping = true,
  disappearing = false,
}: {
  chatId: string;
  me: Profile;
  memberProfiles: Record<string, Pick<Profile, "id" | "username" | "display_name" | "avatar_url">>;
  showTyping?: boolean;
  disappearing?: boolean;
}) {
  const messages = useChatStore((s) => s.messagesByChat[chatId] ?? NO_MESSAGES);
  const hasMore = useChatStore((s) => s.hasMore[chatId] ?? false);
  const prependMessages = useChatStore((s) => s.prependMessages);
  const readers = useChatStore((s) => s.readAt[chatId]);
  const othersReadUpTo = useMemo(() => {
    let upTo = Infinity;
    for (const id of Object.keys(memberProfiles)) {
      if (id === me.id) continue;
      const at = readers?.[id];
      upTo = Math.min(upTo, at ? Date.parse(at) : 0);
    }
    return Number.isFinite(upTo) ? upTo : 0;
  }, [readers, memberProfiles, me.id]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [nearBottom, setNearBottom] = useState(true);
  const [unseenCount, setUnseenCount] = useState(0);
  const prevHeightRef = useRef(0);
  const prevCountRef = useRef(0);
  const isGroup = Object.keys(memberProfiles).length > 2;

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
        el.scrollTop = el.scrollHeight - prevHeightRef.current;
        prevHeightRef.current = 0;
      } else if (wasNearBottom) {
        el.scrollTop = el.scrollHeight;
      } else {
        const incoming = messages.slice(prevCountRef.current);
        const fromOthers = incoming.filter(
          (m) => m.sender_id && m.sender_id !== me.id,
        ).length;
        if (fromOthers > 0) setUnseenCount((n) => n + fromOthers);
      }
    }

    prevCountRef.current = messages.length;
  }, [messages, me.id]);

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
        className="absolute inset-0 overflow-y-auto overscroll-contain px-3 pb-2 pt-4 sm:px-6"
      >
        <div ref={sentinelRef} className="h-1" />
        {loadingOlder && (
          <div className="flex justify-center py-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {messages.length === 0 && !loadingOlder && (
          <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center">
            <p className="text-base font-bold">
              {disappearing ? "Nothing here right now" : "No messages yet"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {disappearing
                ? "Messages in this chat disappear once they have been read."
                : "Say hello to start the conversation."}
            </p>
          </div>
        )}

        <div>
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
                    <span className="rounded-full bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                      {dayLabel(m.created_at)}
                    </span>
                  </div>
                )}
                <MessageBubble
                  message={m}
                  sender={sender}
                  fromMe={fromMe}
                  showSender={isGroup && !fromMe && !prevFromSame}
                  showAvatar={isGroup}
                  groupedTop={prevFromSame}
                  groupedBottom={nextFromSame}
                  readByOther={fromMe && Date.parse(m.created_at) <= othersReadUpTo}
                  canDeleteAny={me.is_admin}
                />
              </div>
            );
          })}
        </div>
        {disappearing && messages.length > 0 && (
          <div className="mt-3 flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-2xl bg-card px-3 py-1 text-center text-xs font-medium text-muted-foreground shadow-sm">
              <Timer className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Seen messages disappear when you leave
            </span>
          </div>
        )}
        <div className="mt-2 flex h-9 items-end" role="status" aria-live="polite">
          {showTyping && <TypingIndicator chatId={chatId} />}
        </div>
      </div>

      {!nearBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom("smooth")}
          aria-label={
            unseenCount > 0 ? `${unseenCount} new, go to the latest message` : "Go to the latest message"
          }
          className={cn(
            "absolute bottom-3 right-3 z-10 flex h-10 items-center gap-1.5 rounded-full shadow-lg transition-transform active:scale-95 sm:right-6",
            unseenCount > 0
              ? "bg-primary px-3.5 text-sm font-semibold text-primary-foreground"
              : "w-10 justify-center border border-border/70 bg-card text-foreground",
          )}
        >
          <ArrowDown className="h-4 w-4" />
          {unseenCount > 0 && `${unseenCount} new`}
        </button>
      )}
    </div>
  );
}
