"use client";

import { useCallback, useEffect, useRef } from "react";
import { getChatChannel } from "@/lib/realtime-registry";
import type { Profile } from "@/types/chat";

export function useTypingBroadcast(chatId: string | null, me: Profile | null) {
  const lastSentRef = useRef(0);

  useEffect(() => {
    lastSentRef.current = 0;
  }, [chatId]);

  return useCallback(() => {
    if (!chatId || !me) return;
    const now = Date.now();
    if (now - lastSentRef.current < 2000) return;
    lastSentRef.current = now;

    const channel = getChatChannel(chatId);
    if (!channel) return;
    void channel.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: me.id, username: me.username },
    });
  }, [chatId, me]);
}
