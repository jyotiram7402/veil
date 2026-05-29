"use client";

import { create } from "zustand";

type PresenceState = {
  online: Set<string>;
  typingByChat: Record<string, Map<string, { username: string; at: number }>>;
  setOnline: (ids: string[]) => void;
  addOnline: (id: string) => void;
  removeOnline: (id: string) => void;
  setTyping: (chatId: string, userId: string, username: string) => void;
  clearTyping: (chatId: string, userId: string) => void;
  prune: () => void;
};

export const usePresenceStore = create<PresenceState>((set, get) => ({
  online: new Set(),
  typingByChat: {},

  setOnline: (ids) => set({ online: new Set(ids) }),
  addOnline: (id) =>
    set((s) => {
      const next = new Set(s.online);
      next.add(id);
      return { online: next };
    }),
  removeOnline: (id) =>
    set((s) => {
      const next = new Set(s.online);
      next.delete(id);
      return { online: next };
    }),

  setTyping: (chatId, userId, username) =>
    set((s) => {
      const map = new Map(s.typingByChat[chatId] ?? []);
      map.set(userId, { username, at: Date.now() });
      return { typingByChat: { ...s.typingByChat, [chatId]: map } };
    }),

  clearTyping: (chatId, userId) =>
    set((s) => {
      const existing = s.typingByChat[chatId];
      if (!existing) return s;
      const map = new Map(existing);
      map.delete(userId);
      return { typingByChat: { ...s.typingByChat, [chatId]: map } };
    }),

  prune: () => {
    const cutoff = Date.now() - 5000;
    const next: PresenceState["typingByChat"] = {};
    let changed = false;
    for (const [chatId, map] of Object.entries(get().typingByChat)) {
      const filtered = new Map(
        Array.from(map.entries()).filter(([, v]) => v.at >= cutoff),
      );
      if (filtered.size !== map.size) changed = true;
      next[chatId] = filtered;
    }
    if (changed) set({ typingByChat: next });
  },
}));
