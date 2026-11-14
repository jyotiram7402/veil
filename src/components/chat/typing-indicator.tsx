"use client";

import { useMemo } from "react";
import { usePresenceStore } from "@/store/presence-store";

/**
 * "Someone is typing" bubble. The message list renders it in a slot it keeps
 * free under the newest message, so it scrolls with the conversation and the
 * messages never jump when it appears or goes away.
 */
export function TypingIndicator({ chatId }: { chatId: string }) {
  const typingMap = usePresenceStore((s) => s.typingByChat[chatId]);
  const names = useMemo(() => {
    if (!typingMap) return [];
    return Array.from(typingMap.values()).map((v) => v.username);
  }, [typingMap]);

  if (names.length === 0) return null;

  const label =
    names.length === 1
      ? `${names[0]} is typing`
      : names.length === 2
        ? `${names[0]} and ${names[1]} are typing`
        : `${names.length} people are typing`;

  return (
    <div className="inline-flex animate-fade-in items-center gap-2 rounded-[1.25rem] rounded-bl-md bg-bubble-in px-3.5 py-2.5 text-xs text-muted-foreground shadow-sm">
      <span className="inline-flex items-center gap-1" aria-hidden="true">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce-dot" />
        <span
          className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce-dot"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce-dot"
          style={{ animationDelay: "300ms" }}
        />
      </span>
      {/* One person: the dots say enough. More than one: say who. */}
      <span className={names.length === 1 ? "sr-only" : undefined}>{label}</span>
    </div>
  );
}
