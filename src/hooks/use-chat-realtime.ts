"use client";

import { useEffect } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useChatStore } from "@/store/chat-store";
import { usePresenceStore } from "@/store/presence-store";
import { clearChatChannel, setChatChannel } from "@/lib/realtime-registry";
import type { Message, MessageWithSender, Profile } from "@/types/chat";

export function useChatRealtime(params: {
  chatId: string | null;
  me: Profile | null;
  memberProfiles: Record<string, Pick<Profile, "id" | "username" | "display_name" | "avatar_url">>;
}) {
  const { chatId, me, memberProfiles } = params;

  const appendMessage = useChatStore((s) => s.appendMessage);
  const removeMessage = useChatStore((s) => s.removeMessage);
  const dropReadMessages = useChatStore((s) => s.dropReadMessages);
  const bumpChatPreview = useChatStore((s) => s.bumpChatPreview);
  const noteReads = useChatStore((s) => s.noteReads);
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
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_members", filter: `chat_id=eq.${chatId}` },
        (payload) => {
          const row = payload.new as { user_id?: unknown; last_read_at?: unknown };
          if (typeof row.user_id === "string" && typeof row.last_read_at === "string") {
            noteReads(chatId, { [row.user_id]: row.last_read_at });
          }
        },
      )
      .on("broadcast", { event: "vanished" }, ({ payload }) => {
        const p = payload as { reader?: unknown; upTo?: unknown };
        if (typeof p.reader === "string" && typeof p.upTo === "string") {
          dropReadMessages(chatId, p.reader, p.upTo);
        }
      })
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
  }, [chatId, me, memberProfiles, appendMessage, removeMessage, dropReadMessages, bumpChatPreview, noteReads, setTyping, clearTyping]);
}
