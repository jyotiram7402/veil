"use client";

import { create } from "zustand";

type SyncState = {
  lastSyncedAt: number;
  syncing: boolean;
  online: boolean;
  markSyncing: (v: boolean) => void;
  markSynced: () => void;
  markFailed: () => void;
};

export const useSyncStore = create<SyncState>((set) => ({
  lastSyncedAt: 0,
  syncing: false,
  online: true,
  markSyncing: (v) => set({ syncing: v }),
  markSynced: () => set({ lastSyncedAt: Date.now(), syncing: false, online: true }),
  markFailed: () => set({ syncing: false, online: false }),
}));
