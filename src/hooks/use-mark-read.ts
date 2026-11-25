"use client";

import { useEffect } from "react";
import { useChatStore } from "@/store/chat-store";
import { useSessionStore } from "@/store/session-store";

const MIN_GAP_MS = 1500;

function newestFromOthers(chatId: string, myId: string): number {
  const list = useChatStore.getState().messagesByChat[chatId] ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i]!;
    if (m.sender_id === myId || m.id.startsWith("local-")) continue;
    return Date.parse(m.created_at);
  }
  return 0;
}

export function useMarkRead(chatId: string, myId: string) {
  useEffect(() => {
    let markedUpTo = 0;
    let lastSent = 0;
    let timer: number | null = null;

    const onScreen = () =>
      document.visibilityState === "visible" && !useSessionStore.getState().locked;

    const send = () => {
      timer = null;
      if (!onScreen()) return;
      const newest = newestFromOthers(chatId, myId);
      if (newest <= markedUpTo) return;
      const previous = markedUpTo;
      markedUpTo = newest;
      lastSent = Date.now();
      const undo = () => {
        if (markedUpTo === newest) markedUpTo = previous;
      };
      void fetch(`/api/chats/${chatId}/read`, { method: "POST" }).then(
        (res) => {
          if (!res.ok) undo();
        },
        undo,
      );
      useChatStore.getState().markChatRead(chatId, new Date().toISOString());
    };

    const look = () => {
      if (timer !== null) return;
      timer = window.setTimeout(send, Math.max(0, lastSent + MIN_GAP_MS - Date.now()));
    };

    look();
    const stopMessages = useChatStore.subscribe((now, before) => {
      if (now.messagesByChat[chatId] !== before.messagesByChat[chatId]) look();
    });
    const stopLock = useSessionStore.subscribe((now, before) => {
      if (now.locked !== before.locked) look();
    });
    const onVisibility = () => {
      if (document.visibilityState === "visible") look();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", look);
    window.addEventListener("pageshow", look);

    return () => {
      stopMessages();
      stopLock();
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", look);
      window.removeEventListener("pageshow", look);
    };
  }, [chatId, myId]);
}
