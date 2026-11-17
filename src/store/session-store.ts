"use client";

import { create } from "zustand";
import type { Profile } from "@/types/chat";

type SessionState = {
  profile: Profile | null;
  locked: boolean;
  setProfile: (p: Profile | null) => void;
  patchProfile: (p: Partial<Profile>) => void;
  setLocked: (locked: boolean) => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  profile: null,
  locked: false,
  setLocked: (locked) => set({ locked }),
  setProfile: (profile) => set({ profile }),
  patchProfile: (p) =>
    set((s) => (s.profile ? { profile: { ...s.profile, ...p } } : s)),
}));
