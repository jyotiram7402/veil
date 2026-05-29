"use client";

import { create } from "zustand";

type SyncState = {
  /** Timestamp (ms) of the most recent successful resync poll. */
  lastSyncedAt: number;
  /** True while a sync request is in-flight. */
  syncing: boolean;
  /** True if the last sync errored out. */
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
