"use client";

import { useEffect } from "react";
import { useChatStore } from "@/store/chat-store";
import { useSyncStore } from "@/store/sync-store";
import type { MessageWithSender, Profile } from "@/types/chat";

const POLL_INTERVAL_MS = 2_000;

/**
 * Two-layer message catch-up:
 *
 *  1. Resume-sync: fires whenever the tab becomes visible / window focuses /
 *     SessionLock unlocks. Closes the gap after backgrounding.
 *  2. Background poll: every 5 seconds while the tab is visible we ask for
 *     any messages newer than the latest one in the store. This is the
 *     reliable fallback for when the Supabase Realtime WebSocket is paused
 *     (mobile background tabs, flaky carriers, restrictive corporate Wi-Fi).
 *     If realtime is healthy the poll is a no-op — `appendMessage` dedupes
 *     by id, so messages can't double-render.
 *
 *  Polling pauses automatically while `document.visibilityState !== "visible"`
 *  so we don't hammer the API from a backgrounded tab.
 */
export function useResumeSync(chatId: string | null, me: Profile | null) {
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
        if (!latest) {
          sync.markSynced();
          return;
        }

        const url = new URL(
          `/api/chats/${chatId}/messages`,
          window.location.origin,
        );
        url.searchParams.set("after", latest.created_at);

        const res = await fetch(url.toString(), { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          sync.markFailed();
          return;
        }
        const body = (await res.json()) as { messages: MessageWithSender[] };
        const incoming = body.messages ?? [];

        if (incoming.length > 0) {
          const liveStore = useChatStore.getState();
          for (const m of incoming) {
            liveStore.appendMessage(chatId, m);
            if (m.sender_id && m.sender_id !== me.id) {
              liveStore.bumpChatPreview(chatId, m, false);
            }
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
    window.addEventListener("veil:resume", onResume);
    window.addEventListener("online", onOnline);

    // First sync immediately on mount, then begin the regular poll cadence.
    void resync();
    scheduleNextPoll();

    return () => {
      cancelled = true;
      if (pollTimer !== null) window.clearTimeout(pollTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("veil:resume", onResume);
      window.removeEventListener("online", onOnline);
    };
  }, [chatId, me]);
}
