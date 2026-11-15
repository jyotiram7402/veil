"use client";

import { useEffect } from "react";
import { useChatStore } from "@/store/chat-store";
import { useSyncStore } from "@/store/sync-store";
import { MESSAGE_PAGE_SIZE } from "@/lib/constants";
import type { MessageWithSender, Profile } from "@/types/chat";

// Safety net only — realtime delivers messages instantly, and we also resync
// immediately on focus / visibility / reconnect. Each poll costs several
// round trips, so polling every 2s kept the app constantly busy.
const POLL_INTERVAL_MS = 5_000;

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
 *
 *  A chat with nothing on screen (a new one, or one where every message has
 *  disappeared) asks for the newest page instead of "newer than the latest".
 *
 *  `exact` is for chats with disappearing messages. There a message can also
 *  stop existing while this screen is not listening (the other person read it
 *  and left while our page was in the background). So each round asks for the
 *  newest page and makes the list agree with it: what the server no longer
 *  has is taken off the screen, what is new is added.
 */
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

        // Disappearing messages: the newest page, and what we had before asking.
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
          page = ((await res.json()) as { messages?: MessageWithSender[] }).messages ?? [];
        }
        const pageIsFull = page !== null && page.length >= MESSAGE_PAGE_SIZE;
        // The page holds everything that is new, unless more than a page
        // arrived while we were away: then the rest is fetched the usual way.
        const latestId = latest?.id;
        const pageCoversIt =
          page !== null && (!pageIsFull || !latestId || page.some((m) => m.id === latestId));

        if (!pageCoversIt) {
          const url = new URL(
            `/api/chats/${chatId}/messages`,
            window.location.origin,
          );
          // Nothing on screen to count from: the newest page it is. Before, an
          // empty chat never caught up at all.
          if (latest) url.searchParams.set("after", latest.created_at);

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

    // First sync immediately on mount, then begin the regular poll cadence.
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
