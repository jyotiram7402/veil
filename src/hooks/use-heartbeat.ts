"use client";

import { useEffect } from "react";
import { PRESENCE_HEARTBEAT_MS } from "@/lib/constants";

/**
 * Lightweight periodic PATCH /api/profile to update last_seen_at while a tab
 * is open. We don't need sub-second precision — once every 30s is plenty for
 * a "last seen 2 minutes ago"–style UX.
 */
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
