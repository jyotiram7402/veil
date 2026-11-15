"use client";

import { create } from "zustand";
import type { ChatSummary, MessageWithSender } from "@/types/chat";

type Stamped = { id: string; sender_id: string | null; created_at: string };

/** Was this message sent to `readerId` (so by anyone else) no later than `cutoff`? */
function readBy(m: Stamped, readerId: string, cutoff: number): boolean {
  return (
    m.sender_id !== readerId && !m.id.startsWith("local-") && Date.parse(m.created_at) <= cutoff
  );
}

/** What somebody left behind in a chat: all they had received up to `cutoff`. */
type LeftBehind = { readerId: string; cutoff: number };

/** A message that is being deleted on the server right now, and must not come back. */
function leftBehindIn(s: { leftBehind: Record<string, LeftBehind> }, chatId: string, m: Stamped) {
  const left = s.leftBehind[chatId];
  return !!left && readBy(m, left.readerId, left.cutoff);
}

/** What the chat list shows for a chat whose newest message is `m`. */
function previewOf(m: MessageWithSender | undefined): ChatSummary["last_message"] {
  if (!m) return null;
  return { id: m.id, content: m.content, type: m.type, created_at: m.created_at, sender_id: m.sender_id };
}

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
  /**
   * Disappearing messages: forget everything `readerId` had received in this
   * chat up to `upTo`. The server has deleted it, or is about to.
   *
   * `remember` is for the second case (this person is leaving right now): the
   * server needs a moment, and until then a list that is loaded again, or an
   * answer that was already on its way, would bring the messages back.
   */
  dropReadMessages: (chatId: string, readerId: string, upTo: string, remember?: boolean) => void;
  /** See `dropReadMessages`: per chat, what has just been left behind. */
  leftBehind: Record<string, LeftBehind>;
  /**
   * Disappearing messages: make this chat's list agree with the newest page
   * the server has just sent (oldest first, as /api/chats/[id]/messages gives it).
   *
   *  - A message we had when we asked (`known`) that the server no longer has
   *    is gone: the other person read it and left while this screen was not
   *    listening (page in the background, connection asleep).
   *  - A message the server has and we do not is added.
   *
   * `partial`: the page was full, so it says nothing about anything older
   * than its first message. Returns the messages that were added.
   */
  matchServer: (
    chatId: string,
    page: MessageWithSender[],
    known: Set<string>,
    partial: boolean,
  ) => MessageWithSender[];
};

export const useChatStore = create<ChatState>((set) => ({
  chats: [],
  messagesByChat: {},
  loadedChats: {},
  hasMore: {},
  leftBehind: {},

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
      if (leftBehindIn(s, chatId, message)) return s;
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
      messagesByChat: {
        ...s.messagesByChat,
        [chatId]: s.leftBehind[chatId]
          ? messages.filter((m) => !leftBehindIn(s, chatId, m))
          : messages,
      },
      loadedChats: { ...s.loadedChats, [chatId]: true },
      hasMore: { ...s.hasMore, [chatId]: hasMore },
    })),

  prependMessages: (chatId, older, hasMore) =>
    set((s) => ({
      messagesByChat: {
        ...s.messagesByChat,
        [chatId]: [
          ...(s.leftBehind[chatId] ? older.filter((m) => !leftBehindIn(s, chatId, m)) : older),
          ...(s.messagesByChat[chatId] ?? []),
        ],
      },
      hasMore: { ...s.hasMore, [chatId]: hasMore },
    })),

  appendMessage: (chatId, message) =>
    set((s) => {
      const list = s.messagesByChat[chatId] ?? [];
      if (list.some((m) => m.id === message.id)) return s;
      if (leftBehindIn(s, chatId, message)) return s;
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

  dropReadMessages: (chatId, readerId, upTo, remember = false) =>
    set((s) => {
      const cutoff = Date.parse(upTo);
      if (Number.isNaN(cutoff)) return s;
      const gone = (m: Stamped) => readBy(m, readerId, cutoff);

      const list = s.messagesByChat[chatId];
      const kept = list ? list.filter((m) => !gone(m)) : undefined;
      const listChanged = !!list && kept!.length !== list.length;

      // The chat list must not go on showing a message that no longer exists.
      const chat = s.chats.find((c) => c.id === chatId);
      const previewGone = !!chat?.last_message && gone(chat.last_message);

      // The later of two leaves by the same person covers the earlier one.
      const before = s.leftBehind[chatId];
      const leftBehind = remember
        ? {
            ...s.leftBehind,
            [chatId]: {
              readerId,
              cutoff: before?.readerId === readerId ? Math.max(before.cutoff, cutoff) : cutoff,
            },
          }
        : s.leftBehind;
      if (!listChanged && !previewGone) return remember ? { leftBehind } : s;

      return {
        leftBehind,
        messagesByChat: listChanged ? { ...s.messagesByChat, [chatId]: kept! } : s.messagesByChat,
        chats: previewGone
          ? s.chats.map((c) =>
              c.id === chatId
                ? { ...c, last_message: kept ? previewOf(kept[kept.length - 1]) : null }
                : c,
            )
          : s.chats,
      };
    }),

  matchServer: (chatId, page, known, partial) => {
    let added: MessageWithSender[] = [];
    set((s) => {
      const list = s.messagesByChat[chatId] ?? [];
      const onServer = new Set(page.map((m) => m.id));
      // A full page only speaks for the time after its first message.
      const floor = partial && page.length > 0 ? Date.parse(page[0]!.created_at) : -Infinity;
      const gone = new Set<string>();
      for (const m of list) {
        if (known.has(m.id) && !onServer.has(m.id) && Date.parse(m.created_at) > floor) gone.add(m.id);
      }
      const have = new Set(list.map((m) => m.id));
      added = page.filter((m) => !have.has(m.id) && !leftBehindIn(s, chatId, m));
      if (gone.size === 0 && added.length === 0) return s;

      // Sent messages in the order they were written, then the ones still on their way.
      const sent = [...list.filter((m) => !gone.has(m.id) && !m.id.startsWith("local-")), ...added].sort(
        (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
      );
      const next = [...sent, ...list.filter((m) => m.id.startsWith("local-"))];

      const chat = s.chats.find((c) => c.id === chatId);
      const previewGone = !!chat?.last_message && gone.has(chat.last_message.id);
      return {
        messagesByChat: { ...s.messagesByChat, [chatId]: next },
        chats: previewGone
          ? s.chats.map((c) =>
              c.id === chatId ? { ...c, last_message: previewOf(next[next.length - 1]) } : c,
            )
          : s.chats,
      };
    });
    return added;
  },
}));
