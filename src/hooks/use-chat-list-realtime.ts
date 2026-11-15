"use client";

import { useEffect, useRef } from "react";
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
  // The list of chats changes with every message (it is re-sorted), so it is
  // read through a ref: listing it as a dependency tore the channel down and
  // joined it again on each message, losing whatever arrived in between.
  const knownRef = useRef(knownChatIds);
  knownRef.current = knownChatIds;
  const hasChats = knownChatIds.length > 0;

  useEffect(() => {
    if (!me || !hasChats) return;
    const supabase = supabaseBrowser();

    // A deleted message (by hand, or disappearing messages) may be the one a
    // row in the list is showing. A delete only tells us an id, so load the
    // list again; a burst of deletes becomes one request.
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
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, refreshSoon)
      .subscribe();

    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [me, hasChats, refreshChats, bumpChatPreview]);
}
