"use client";

import { useEffect } from "react";
import { PRESENCE_HEARTBEAT_MS } from "@/lib/constants";

export function useHeartbeat(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const ping = () => {
      void fetch("/api/profile/heartbeat", { method: "POST" });
    };
    ping();
    const id = window.setInterval(ping, PRESENCE_HEARTBEAT_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);
}
