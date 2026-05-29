"use client";

import { useEffect } from "react";
import { useChatStore } from "@/store/chat-store";
import type { MessageWithSender, Profile } from "@/types/chat";

/**
 * Closes the gap in the message stream every time the user's session
 * resumes. Supabase Realtime's postgres_changes doesn't replay missed
 * inserts on reconnect — mobile browsers kill WebSockets the moment a tab
 * goes background, and anything that landed in the DB during the gap is
 * gone from the stream.
 *
 * This hook fires a tight `?after=<latest_known_created_at>` fetch:
 *   - on mount
 *   - on `visibilitychange` to visible
 *   - on window `focus`
 *   - on the `veil:resume` custom event (dispatched by SessionLock on unlock)
 *
 * Any messages we get back are appended via the store, which dedupes by id
 * so realtime + resume can't double-render the same row.
 */
export function useResumeSync(chatId: string | null, me: Profile | null) {
  useEffect(() => {
    if (!chatId || !me) return;

    let inflight = false;
    let cancelled = false;

    const resync = async () => {
      if (inflight) return;
      inflight = true;
      try {
        const store = useChatStore.getState();
        const messages = store.messagesByChat[chatId] ?? [];
        // Walk backwards skipping optimistic ids to find the latest real
        // server timestamp we can ask "after" against.
        let latest: MessageWithSender | null = null;
        for (let i = messages.length - 1; i >= 0; i--) {
          const m = messages[i]!;
          if (!m.id.startsWith("local-")) {
            latest = m;
            break;
          }
        }
        if (!latest) return;

        const url = new URL(
          `/api/chats/${chatId}/messages`,
          window.location.origin,
        );
        url.searchParams.set("after", latest.created_at);

        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { messages: MessageWithSender[] };
        const incoming = body.messages ?? [];
        if (incoming.length === 0) return;

        const liveStore = useChatStore.getState();
        for (const m of incoming) {
          liveStore.appendMessage(chatId, m);
          // Update sidebar preview only for messages from the OTHER side.
          if (m.sender_id && m.sender_id !== me.id) {
            liveStore.bumpChatPreview(chatId, m, false);
          }
        }
      } finally {
        inflight = false;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void resync();
    };
    const onFocus = () => void resync();
    const onResume = () => void resync();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("veil:resume", onResume);

    // Also fire once on mount: covers SPA navigation between chats.
    void resync();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("veil:resume", onResume);
    };
  }, [chatId, me]);
}
