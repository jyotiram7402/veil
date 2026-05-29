"use client";

import { useCallback, useRef } from "react";

/**
 * Returns props you spread onto an element to detect a long-press
 * (touchstart held for >= 500ms) or a right-click. Fires `onTrigger` with
 * the pointer x/y so callers can position a context menu where the user
 * touched. Cancels on scroll / pointer move beyond 8px.
 */
export function useLongPress(onTrigger: (x: number, y: number) => void, ms: number = 500) {
  const timeoutRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const clear = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    startRef.current = null;
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      startRef.current = { x: t.clientX, y: t.clientY };
      timeoutRef.current = window.setTimeout(() => {
        if (startRef.current) onTrigger(startRef.current.x, startRef.current.y);
        clear();
      }, ms);
    },
    [onTrigger, ms, clear],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!startRef.current) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startRef.current.x;
      const dy = t.clientY - startRef.current.y;
      if (Math.hypot(dx, dy) > 8) clear();
    },
    [clear],
  );

  const onTouchEnd = clear;
  const onTouchCancel = clear;

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onTrigger(e.clientX, e.clientY);
    },
    [onTrigger],
  );

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, onContextMenu };
}
