"use client";

import { useEffect, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useChatStore } from "@/store/chat-store";
import type { Message, MessageWithSender, Profile } from "@/types/chat";

export function useChatListRealtime(params: {
  me: Profile | null;
  knownChatIds: string[];
  refreshChats: () => void;
}) {
  const { me, knownChatIds, refreshChats } = params;
  const bumpChatPreview = useChatStore((s) => s.bumpChatPreview);
  const knownRef = useRef(knownChatIds);
  knownRef.current = knownChatIds;
  const hasChats = knownChatIds.length > 0;

  useEffect(() => {
    if (!me || !hasChats) return;
    const supabase = supabaseBrowser();

    let refreshTimer: number | null = null;
    const refreshSoon = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        refreshChats();
      }, 600);
    };

    const channel = supabase
      .channel(`chats:${me.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as Message;
          if (!knownRef.current.includes(row.chat_id)) {
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
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, refreshSoon)
      .subscribe();

    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [me, hasChats, refreshChats, bumpChatPreview]);
}
