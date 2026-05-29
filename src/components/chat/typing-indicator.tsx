"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePresenceStore } from "@/store/presence-store";

export function TypingIndicator({ chatId }: { chatId: string }) {
  const typingMap = usePresenceStore((s) => s.typingByChat[chatId]);
  const names = useMemo(() => {
    if (!typingMap) return [];
    return Array.from(typingMap.values()).map((v) => v.username);
  }, [typingMap]);

  if (names.length === 0) return <div className="h-5" />;

  const label =
    names.length === 1
      ? `${names[0]} is typing`
      : names.length === 2
        ? `${names[0]} and ${names[1]} are typing`
        : `${names.length} people are typing`;

  return (
    <div className="h-5 px-4 sm:px-6 -mt-2 text-[11px] text-muted-foreground flex items-center gap-2">
      <AnimatePresence mode="wait">
        <motion.span
          key={label}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="flex items-center gap-2"
        >
          <span className="inline-flex items-center gap-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70 animate-bounce-dot" />
            <span
              className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70 animate-bounce-dot"
              style={{ animationDelay: "150ms" }}
            />
            <span
              className="h-1.5 w-1.5 rounded-full bg-muted-foreground/70 animate-bounce-dot"
              style={{ animationDelay: "300ms" }}
            />
          </span>
          {label}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
