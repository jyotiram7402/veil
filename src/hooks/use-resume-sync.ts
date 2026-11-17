"use client";

import { useEffect } from "react";
import { useChatStore } from "@/store/chat-store";
import { useSyncStore } from "@/store/sync-store";
import { MESSAGE_PAGE_SIZE } from "@/lib/constants";
import type { MessageWithSender, Profile } from "@/types/chat";

const POLL_INTERVAL_MS = 5_000;

export function useResumeSync(chatId: string | null, me: Profile | null, exact = false) {
  useEffect(() => {
    if (!chatId || !me) return;

    let inflight = false;
    let cancelled = false;
    let pollTimer: number | null = null;

    const sync = useSyncStore.getState();

    const resync = async () => {
      if (inflight || cancelled) return;
      inflight = true;
      useSyncStore.setState({ syncing: true });
      try {
        const store = useChatStore.getState();
        const messages = store.messagesByChat[chatId] ?? [];
        let latest: MessageWithSender | null = null;
        for (let i = messages.length - 1; i >= 0; i--) {
          const m = messages[i]!;
          if (!m.id.startsWith("local-")) {
            latest = m;
            break;
          }
        }

        let page: MessageWithSender[] | null = null;
        const known = new Set<string>();
        if (exact) {
          for (const m of messages) if (!m.id.startsWith("local-")) known.add(m.id);
          const res = await fetch(`/api/chats/${chatId}/messages`, { cache: "no-store" });
          if (cancelled) return;
          if (!res.ok) {
            sync.markFailed();
            return;
          }
          const body = (await res.json()) as {
            messages?: MessageWithSender[];
            readers?: Record<string, string>;
          };
          page = body.messages ?? [];
          if (body.readers) useChatStore.getState().noteReads(chatId, body.readers);
        }
        const pageIsFull = page !== null && page.length >= MESSAGE_PAGE_SIZE;
        const latestId = latest?.id;
        const pageCoversIt =
          page !== null && (!pageIsFull || !latestId || page.some((m) => m.id === latestId));

        if (!pageCoversIt) {
          const url = new URL(
            `/api/chats/${chatId}/messages`,
            window.location.origin,
          );
          if (latest) url.searchParams.set("after", latest.created_at);

          const res = await fetch(url.toString(), { cache: "no-store" });
          if (cancelled) return;
          if (!res.ok) {
            sync.markFailed();
            return;
          }
          const body = (await res.json()) as {
            messages: MessageWithSender[];
            readers?: Record<string, string>;
          };
          const incoming = body.messages ?? [];
          if (body.readers) useChatStore.getState().noteReads(chatId, body.readers);

          if (incoming.length > 0) {
            const liveStore = useChatStore.getState();
            for (const m of incoming) {
              liveStore.appendMessage(chatId, m);
              if (m.sender_id && m.sender_id !== me.id) {
                liveStore.bumpChatPreview(chatId, m, false);
              }
            }
          }
        }

        if (page !== null) {
          const liveStore = useChatStore.getState();
          const added = liveStore.matchServer(chatId, page, known, pageIsFull);
          for (const m of added) {
            if (m.sender_id && m.sender_id !== me.id) liveStore.bumpChatPreview(chatId, m, false);
          }
        }
        sync.markSynced();
      } catch {
        sync.markFailed();
      } finally {
        inflight = false;
      }
    };

    const scheduleNextPoll = () => {
      if (cancelled) return;
      pollTimer = window.setTimeout(async () => {
        if (cancelled) return;
        if (document.visibilityState === "visible") {
          await resync();
        }
        scheduleNextPoll();
      }, POLL_INTERVAL_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void resync();
    };
    const onFocus = () => void resync();
    const onResume = () => void resync();
    const onOnline = () => void resync();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blackfoxx:resume", onResume);
    window.addEventListener("online", onOnline);

    void resync();
    scheduleNextPoll();

    return () => {
      cancelled = true;
      if (pollTimer !== null) window.clearTimeout(pollTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blackfoxx:resume", onResume);
      window.removeEventListener("online", onOnline);
    };
  }, [chatId, me, exact]);
}
