"use client";

import { useEffect, useRef } from "react";
import { useChatStore } from "@/store/chat-store";
import { useSessionStore } from "@/store/session-store";

/**
 * Disappearing messages, the screen's half (the rule itself is in
 * src/lib/vanish.ts): while the chat is really on screen, everything in it
 * counts as read. When the person then leaves (goes back to the list, opens
 * another chat, switches app or tab, locks the phone, closes the page), the
 * server is told how far they had read, and what they had received up to
 * there is deleted for both people, for good.
 *
 * Not read means not deleted: a message that arrives while the page is hidden
 * or behind the screen lock stays until it has been on screen.
 */

/** Leaves the server has not confirmed yet: chat id → how far had been read. */
const unconfirmed = new Map<string, string>();
/** Chats with a request on its way that waits for the server's answer. */
const asking = new Set<string>();
/** Chat screens that have just closed, and are believed a moment later (see the effect). */
const closing = new Map<string, number>();

/** A very long history is deleted in several requests. This is the most for one leave. */
const MAX_REQUESTS = 20;

function vanishUrl(chatId: string) {
  return `/api/chats/${chatId}/vanish`;
}

/** Keeps the later of two leaves from the same chat. */
function remember(chatId: string, upTo: string) {
  const known = unconfirmed.get(chatId);
  if (!known || Date.parse(upTo) >= Date.parse(known)) unconfirmed.set(chatId, upTo);
}

/**
 * Tells the server about the leave that is still open for this chat and waits
 * for the answer. Returns how many messages the server deleted. When the
 * server cannot be reached the leave stays open, and is told again the next
 * time the chat is on screen.
 */
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
        // Signed out, no longer in the chat, or a time the server does not
        // accept: asking again would change nothing. Anything else can be retried.
        if (res.status >= 400 && res.status < 500 && res.status !== 429) unconfirmed.delete(chatId);
        break;
      }
      const body = (await res.json().catch(() => ({}))) as { deleted?: number; more?: boolean };
      deleted += body.deleted ?? 0;
      if (body.more) continue;
      // Done, unless the person has left again since this request was sent.
      if (unconfirmed.get(chatId) === upTo) unconfirmed.delete(chatId);
    }
  } catch {
    /* offline: the leave stays open */
  } finally {
    asking.delete(chatId);
  }
  return deleted;
}

/**
 * The same, while the page itself is being hidden or closed: nothing can be
 * waited for, so the request is handed to the browser to send on its own. The
 * leave stays open and is confirmed the next time the chat is on screen.
 */
function tellWhileLeaving(chatId: string) {
  const upTo = unconfirmed.get(chatId);
  if (!upTo) return;
  const body = JSON.stringify({ upTo });
  try {
    // Sent as text: every browser allows that from a page that is going away.
    if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon(vanishUrl(chatId), body)) {
      return;
    }
  } catch {
    /* fall through to fetch */
  }
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
  /** Whether the admin has switched disappearing messages on for this chat. */
  enabled: boolean;
  /** Called once the server has deleted something, when the app is still open to care. */
  onGone?: () => void;
}) {
  const onGoneRef = useRef(onGone);
  onGoneRef.current = onGone;

  useEffect(() => {
    // In development React closes every new screen once and opens it again
    // straight away. A closed screen is therefore only believed a moment
    // later, and forgotten when the same chat is back by then.
    const wasClosing = closing.get(chatId);
    if (wasClosing !== undefined) {
      window.clearTimeout(wasClosing);
      closing.delete(chatId);
    }
    if (!enabled) return;

    // The time of the newest message from the other person that has been on screen.
    let readUpTo: string | null = null;
    let lookSoon: number | null = null;
    // A page that is closed is first hidden and then unloaded: tell the server once.
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

    // A moment later: by then the rest of the screen has settled.
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

    /** `pageGoing`: the page itself is being hidden or closed. */
    const leave = (pageGoing: boolean) => {
      if (!readUpTo) {
        // Nothing new was read, but an earlier leave may still be open: one more try.
        if (pageGoing && !toldWhileHidden) {
          toldWhileHidden = true;
          tellWhileLeaving(chatId);
        }
        return;
      }
      const upTo = readUpTo;
      readUpTo = null;
      // Gone from this screen at once, whatever the network does, and not to
      // be brought back by an answer that was already on its way.
      useChatStore.getState().dropReadMessages(chatId, myId, upTo, true);
      remember(chatId, upTo);
      if (pageGoing) {
        toldWhileHidden = true;
        tellWhileLeaving(chatId);
      } else void report();
    };

    /** The chat is (back) on screen. */
    const arrive = () => {
      toldWhileHidden = false;
      // A leave from before that the server never confirmed.
      void report();
      look();
    };

    // A leave from an earlier visit that the server never confirmed.
    void report();
    // The chat is only being put on screen: the lock and the first messages
    // may not be in place yet.
    lookLater();
    const stopMessages = useChatStore.subscribe((now, before) => {
      if (now.messagesByChat[chatId] !== before.messagesByChat[chatId]) look();
    });
    const stopLock = useSessionStore.subscribe((now, before) => {
      // Not at once: the lock also reports "open" when it is taken away
      // together with the chat, and nothing has been read then.
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
    // A page brought back from the browser's back/forward cache.
    window.addEventListener("pageshow", arrive);
    // The connection is back: a leave that could not be told can be told now.
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
      // The chat screen itself is closing: back to the list, or another chat.
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
