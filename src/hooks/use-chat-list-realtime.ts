"use client";

import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useChatStore } from "@/store/chat-store";
import type { Message, MessageWithSender, Profile } from "@/types/chat";

/**
 * Listens globally for messages in any of my chats and bumps the chat list
 * preview / unread count. Falls back to a focused refetch when we don't have
 * a sender profile cached yet.
 */
export function useChatListRealtime(params: {
  me: Profile | null;
  knownChatIds: string[];
  refreshChats: () => void;
}) {
  const { me, knownChatIds, refreshChats } = params;
  const bumpChatPreview = useChatStore((s) => s.bumpChatPreview);

  useEffect(() => {
    if (!me || knownChatIds.length === 0) return;
    const supabase = supabaseBrowser();

    const channel = supabase
      .channel(`chats:${me.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as Message;
          if (!knownChatIds.includes(row.chat_id)) {
            // new chat we don't know about yet — refetch list
            refreshChats();
            return;
          }
          const message: MessageWithSender = { ...row, sender: null };
          bumpChatPreview(row.chat_id, message, row.sender_id === me.id);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_members", filter: `user_id=eq.${me.id}` },
        () => refreshChats(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [me, knownChatIds, refreshChats, bumpChatPreview]);
}
