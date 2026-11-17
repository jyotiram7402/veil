"use client";

import { useEffect } from "react";
import { usePresenceStore } from "@/store/presence-store";

export function useTypingPrune() {
  const prune = usePresenceStore((s) => s.prune);
  useEffect(() => {
    const id = window.setInterval(prune, 1500);
    return () => window.clearInterval(id);
  }, [prune]);
}
