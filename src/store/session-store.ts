"use client";

import { create } from "zustand";
import type { Profile } from "@/types/chat";

type SessionState = {
  profile: Profile | null;
  setProfile: (p: Profile | null) => void;
  patchProfile: (p: Partial<Profile>) => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  profile: null,
  setProfile: (profile) => set({ profile }),
  patchProfile: (p) =>
    set((s) => (s.profile ? { profile: { ...s.profile, ...p } } : s)),
}));
