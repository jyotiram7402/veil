"use client";

import { useEffect, useRef } from "react";
import { useChatStore } from "@/store/chat-store";
import { useSessionStore } from "@/store/session-store";

const unconfirmed = new Map<string, string>();
const asking = new Set<string>();
const closing = new Map<string, number>();

const MAX_REQUESTS = 20;

function vanishUrl(chatId: string) {
  return `/api/chats/${chatId}/vanish`;
}

function remember(chatId: string, upTo: string) {
  const known = unconfirmed.get(chatId);
  if (!known || Date.parse(upTo) >= Date.parse(known)) unconfirmed.set(chatId, upTo);
}

async function tell(chatId: string): Promise<number> {
  if (asking.has(chatId)) return 0;
  asking.add(chatId);
  let deleted = 0;
  try {
    for (let i = 0; i < MAX_REQUESTS; i++) {
      const upTo = unconfirmed.get(chatId);
      if (!upTo) break;
      const res = await fetch(vanishUrl(chatId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upTo }),
        keepalive: true,
      });
      if (!res.ok) {
        if (res.status >= 400 && res.status < 500 && res.status !== 429) unconfirmed.delete(chatId);
        break;
      }
      const body = (await res.json().catch(() => ({}))) as { deleted?: number; more?: boolean };
      deleted += body.deleted ?? 0;
      if (body.more) continue;
      if (unconfirmed.get(chatId) === upTo) unconfirmed.delete(chatId);
    }
  } catch {} finally {
    asking.delete(chatId);
  }
  return deleted;
}

function tellWhileLeaving(chatId: string) {
  const upTo = unconfirmed.get(chatId);
  if (!upTo) return;
  const body = JSON.stringify({ upTo });
  try {
    if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon(vanishUrl(chatId), body)) {
      return;
    }
  } catch {}
  void fetch(vanishUrl(chatId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

export function useVanishOnLeave({
  chatId,
  myId,
  enabled,
  onGone,
}: {
  chatId: string;
  myId: string;
  enabled: boolean;
  onGone?: () => void;
}) {
  const onGoneRef = useRef(onGone);
  onGoneRef.current = onGone;

  useEffect(() => {
    const wasClosing = closing.get(chatId);
    if (wasClosing !== undefined) {
      window.clearTimeout(wasClosing);
      closing.delete(chatId);
    }
    if (!enabled) return;

    let readUpTo: string | null = null;
    let lookSoon: number | null = null;
    let toldWhileHidden = false;

    const onScreen = () =>
      document.visibilityState === "visible" && !useSessionStore.getState().locked;

    const look = () => {
      if (!onScreen()) return;
      const list = useChatStore.getState().messagesByChat[chatId] ?? [];
      for (let i = list.length - 1; i >= 0; i--) {
        const m = list[i]!;
        if (m.sender_id === myId || m.id.startsWith("local-")) continue;
        readUpTo = m.created_at;
        return;
      }
    };

    const lookLater = () => {
      if (lookSoon !== null) window.clearTimeout(lookSoon);
      lookSoon = window.setTimeout(() => {
        lookSoon = null;
        look();
      }, 0);
    };

    const report = async () => {
      const deleted = await tell(chatId);
      if (deleted > 0) onGoneRef.current?.();
    };

    const leave = (pageGoing: boolean) => {
      if (!readUpTo) {
        if (pageGoing && !toldWhileHidden) {
          toldWhileHidden = true;
          tellWhileLeaving(chatId);
        }
        return;
      }
      const upTo = readUpTo;
      readUpTo = null;
      useChatStore.getState().dropReadMessages(chatId, myId, upTo, true);
      remember(chatId, upTo);
      if (pageGoing) {
        toldWhileHidden = true;
        tellWhileLeaving(chatId);
      } else void report();
    };

    const arrive = () => {
      toldWhileHidden = false;
      void report();
      look();
    };

    void report();
    lookLater();
    const stopMessages = useChatStore.subscribe((now, before) => {
      if (now.messagesByChat[chatId] !== before.messagesByChat[chatId]) look();
    });
    const stopLock = useSessionStore.subscribe((now, before) => {
      if (now.locked !== before.locked) lookLater();
    });
    const onVisibility = () => {
      if (document.visibilityState === "hidden") leave(true);
      else arrive();
    };
    const onPageHide = () => leave(true);
    const onOnline = () => void report();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", arrive);
    window.addEventListener("online", onOnline);

    return () => {
      stopMessages();
      stopLock();
      if (lookSoon !== null) window.clearTimeout(lookSoon);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", arrive);
      window.removeEventListener("online", onOnline);
      if (!readUpTo) return;
      closing.set(
        chatId,
        window.setTimeout(() => {
          closing.delete(chatId);
          leave(false);
        }, 0),
      );
    };
  }, [chatId, myId, enabled]);
}
