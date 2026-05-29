"use client";

import { create } from "zustand";
import type { ChatSummary, MessageWithSender } from "@/types/chat";

type ChatState = {
  chats: ChatSummary[];
  setChats: (chats: ChatSummary[]) => void;
  upsertChat: (chat: ChatSummary) => void;
  bumpChatPreview: (chatId: string, message: MessageWithSender, fromSelf: boolean) => void;
  markChatRead: (chatId: string, at: string) => void;
  removeChat: (chatId: string) => void;

  /** messages keyed by chat id */
  messagesByChat: Record<string, MessageWithSender[]>;
  /** whether we've loaded the first page for a chat */
  loadedChats: Record<string, boolean>;
  /** whether more history exists */
  hasMore: Record<string, boolean>;
  setInitialMessages: (chatId: string, messages: MessageWithSender[], hasMore: boolean) => void;
  prependMessages: (chatId: string, older: MessageWithSender[], hasMore: boolean) => void;
  appendMessage: (chatId: string, message: MessageWithSender) => void;
  replaceMessage: (chatId: string, tempId: string, real: MessageWithSender) => void;
  removeMessage: (chatId: string, messageId: string) => void;
};

export const useChatStore = create<ChatState>((set) => ({
  chats: [],
  messagesByChat: {},
  loadedChats: {},
  hasMore: {},

  setChats: (chats) =>
    set({
      chats: [...chats].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      ),
    }),

  upsertChat: (chat) =>
    set((s) => {
      const next = s.chats.filter((c) => c.id !== chat.id);
      next.unshift(chat);
      return { chats: next };
    }),

  bumpChatPreview: (chatId, message, fromSelf) =>
    set((s) => {
      const idx = s.chats.findIndex((c) => c.id === chatId);
      if (idx === -1) return s;
      const chat = s.chats[idx]!;
      // Two realtime listeners (chat-list-wide + per-chat) can fire for the
      // same insert. Dedupe by id so we don't double-count unread.
      if (chat.last_message && chat.last_message.id === message.id) return s;
      const updated: ChatSummary = {
        ...chat,
        updated_at: message.created_at,
        last_message: {
          id: message.id,
          content: message.content,
          type: message.type,
          created_at: message.created_at,
          sender_id: message.sender_id,
        },
        unread_count: fromSelf ? 0 : chat.unread_count + 1,
      };
      const rest = s.chats.filter((c) => c.id !== chatId);
      return { chats: [updated, ...rest] };
    }),

  markChatRead: (chatId, at) =>
    set((s) => ({
      chats: s.chats.map((c) =>
        c.id === chatId ? { ...c, unread_count: 0, my_last_read_at: at } : c,
      ),
    })),

  removeChat: (chatId) =>
    set((s) => ({ chats: s.chats.filter((c) => c.id !== chatId) })),

  setInitialMessages: (chatId, messages, hasMore) =>
    set((s) => ({
      messagesByChat: { ...s.messagesByChat, [chatId]: messages },
      loadedChats: { ...s.loadedChats, [chatId]: true },
      hasMore: { ...s.hasMore, [chatId]: hasMore },
    })),

  prependMessages: (chatId, older, hasMore) =>
    set((s) => ({
      messagesByChat: {
        ...s.messagesByChat,
        [chatId]: [...older, ...(s.messagesByChat[chatId] ?? [])],
      },
      hasMore: { ...s.hasMore, [chatId]: hasMore },
    })),

  appendMessage: (chatId, message) =>
    set((s) => {
      const list = s.messagesByChat[chatId] ?? [];
      if (list.some((m) => m.id === message.id)) return s;
      return {
        messagesByChat: { ...s.messagesByChat, [chatId]: [...list, message] },
      };
    }),

  replaceMessage: (chatId, tempId, real) =>
    set((s) => {
      const list = s.messagesByChat[chatId];
      if (!list) return s;
      return {
        messagesByChat: {
          ...s.messagesByChat,
          [chatId]: list.map((m) => (m.id === tempId ? real : m)),
        },
      };
    }),

  removeMessage: (chatId, messageId) =>
    set((s) => {
      const list = s.messagesByChat[chatId];
      if (!list) return s;
      return {
        messagesByChat: {
          ...s.messagesByChat,
          [chatId]: list.filter((m) => m.id !== messageId),
        },
      };
    }),
}));
