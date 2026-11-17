"use client";

import { create } from "zustand";
import { onPushStatus, pushStatus, type PushStatus } from "@/lib/push-client";

export type PushHelp = "install" | "blocked";

type PushState = {
  status: PushStatus | null;
  busy: boolean;
  help: PushHelp | null;
  promptHidden: boolean;
  setBusy: (busy: boolean) => void;
  setHelp: (help: PushHelp | null) => void;
  setPromptHidden: (hidden: boolean) => void;
};

export const usePushStore = create<PushState>((set) => ({
  status: pushStatus(),
  busy: false,
  help: null,
  promptHidden: true,
  setBusy: (busy) => set({ busy }),
  setHelp: (help) => set({ help }),
  setPromptHidden: (promptHidden) => set({ promptHidden }),
}));

if (typeof window !== "undefined") {
  onPushStatus(() => usePushStore.setState({ status: pushStatus() }));
}
