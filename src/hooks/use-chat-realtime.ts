"use client";

import { useEffect } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useChatStore } from "@/store/chat-store";
import { usePresenceStore } from "@/store/presence-store";
import { clearChatChannel, setChatChannel } from "@/lib/realtime-registry";
import type { Message, MessageWithSender, Profile } from "@/types/chat";

/**
 * Subscribes to per-chat realtime channel for:
 *  - new/updated/deleted messages (Postgres CDC)
 *  - typing indicators (broadcast)
 *
 * The subscribed channel is registered so `useTypingBroadcast` can reuse
 * it for sending — creating a second channel with the same name would
 * be an unconnected no-op.
 */
export function useChatRealtime(params: {
  chatId: string | null;
  me: Profile | null;
  memberProfiles: Record<string, Pick<Profile, "id" | "username" | "display_name" | "avatar_url">>;
}) {
  const { chatId, me, memberProfiles } = params;

  const appendMessage = useChatStore((s) => s.appendMessage);
  const removeMessage = useChatStore((s) => s.removeMessage);
  const bumpChatPreview = useChatStore((s) => s.bumpChatPreview);
  const setTyping = usePresenceStore((s) => s.setTyping);
  const clearTyping = usePresenceStore((s) => s.clearTyping);

  useEffect(() => {
    if (!chatId || !me) return;
    const supabase = supabaseBrowser();

    const channel: RealtimeChannel = supabase
      .channel(`chat:${chatId}`, { config: { broadcast: { self: false } } })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
        (payload) => {
          const row = payload.new as Message;
          // For self-sent messages, the API response already inserted the real
          // row into our local list via replaceMessage(). Listening to the
          // CDC echo here would duplicate if the realtime event raced ahead.
          if (row.sender_id === me.id) return;
          const sender = row.sender_id ? memberProfiles[row.sender_id] ?? null : null;
          const message: MessageWithSender = { ...row, sender };
          appendMessage(chatId, message);
          bumpChatPreview(chatId, message, false);
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
        (payload) => {
          const old = payload.old as { id: string };
          removeMessage(chatId, old.id);
        },
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const p = payload as { userId: string; username: string };
        if (p.userId === me.id) return;
        setTyping(chatId, p.userId, p.username);
        window.setTimeout(() => clearTyping(chatId, p.userId), 4500);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setChatChannel(chatId, channel);
      });

    return () => {
      clearChatChannel(chatId);
      supabase.removeChannel(channel);
    };
  }, [chatId, me, memberProfiles, appendMessage, removeMessage, bumpChatPreview, setTyping, clearTyping]);
}
