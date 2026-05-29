"use client";

import { useEffect, useState } from "react";
import { useSyncStore } from "@/store/sync-store";
import { cn } from "@/lib/utils";

/**
 * Tiny dot in the chat header that pulses green when sync is healthy
 * (last successful resync within the last few seconds), amber while a
 * sync is in-flight, and red when the last attempt errored. Gives the
 * user something to look at when they're wondering if the chat is alive.
 */
export function LiveIndicator() {
  const syncing = useSyncStore((s) => s.syncing);
  const online = useSyncStore((s) => s.online);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  const [stale, setStale] = useState(false);
  useEffect(() => {
    const id = window.setInterval(() => {
      setStale(Date.now() - lastSyncedAt > 12_000);
    }, 1000);
    return () => window.clearInterval(id);
  }, [lastSyncedAt]);

  const color = !online
    ? "bg-destructive"
    : syncing
      ? "bg-amber-400"
      : stale
        ? "bg-zinc-400"
        : "bg-emerald-400";

  return (
    <span
      title={!online ? "Reconnecting…" : syncing ? "Syncing" : stale ? "Idle" : "Live"}
      className="relative inline-flex h-2 w-2"
      aria-hidden
    >
      <span
        className={cn(
          "absolute inset-0 rounded-full",
          color,
          !online ? "" : "animate-ping opacity-60",
        )}
      />
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", color)} />
    </span>
  );
}
