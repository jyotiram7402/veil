"use client";

import { useEffect } from "react";
import { PRESENCE_HEARTBEAT_MS } from "@/lib/constants";
import {
  clearShownNotifications,
  onPushStatus,
  pushEndpoint,
  pushKnown,
} from "@/lib/push-client";

const HEARTBEAT_URL = "/api/profile/heartbeat";
const JSON_HEADERS = { "Content-Type": "application/json" };

function inFront(): boolean {
  if (document.visibilityState !== "visible") return false;
  const hasWindows = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  return !hasWindows || document.hasFocus();
}

let toldEndpoint: string | null = null;

function ping() {
  toldEndpoint = pushEndpoint();
  void fetch(HEARTBEAT_URL, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ endpoint: toldEndpoint ?? undefined }),
  }).catch(() => undefined);
}

function sayAway() {
  const endpoint = pushEndpoint();
  if (!endpoint) return;
  const body = JSON.stringify({ endpoint, away: true });
  try {
    if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon(HEARTBEAT_URL, body)) {
      return;
    }
  } catch {}
  void fetch(HEARTBEAT_URL, {
    method: "POST",
    headers: JSON_HEADERS,
    body,
    keepalive: true,
  }).catch(() => undefined);
}

export function useHeartbeat(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let wasInFront = false;

    const check = () => {
      const now = inFront();
      if (now && !wasInFront) {
        ping();
        clearShownNotifications();
      }
      if (!now && wasInFront) sayAway();
      wasInFront = now;
    };
    const beat = () => {
      const before = wasInFront;
      check();
      if (before && wasInFront) ping();
    };
    const leave = () => {
      if (wasInFront) sayAway();
      wasInFront = false;
    };

    let stop = () => {};
    let stopped = false;
    void pushKnown().then(() => {
      if (stopped) return;
      check();
      const id = window.setInterval(beat, PRESENCE_HEARTBEAT_MS);
      const stopPush = onPushStatus(() => {
        if (!wasInFront || pushEndpoint() === toldEndpoint) return;
        ping();
        clearShownNotifications();
      });
      document.addEventListener("visibilitychange", check);
      window.addEventListener("focus", check);
      window.addEventListener("blur", check);
      window.addEventListener("pageshow", check);
      window.addEventListener("pagehide", leave);
      stop = () => {
        window.clearInterval(id);
        stopPush();
        document.removeEventListener("visibilitychange", check);
        window.removeEventListener("focus", check);
        window.removeEventListener("blur", check);
        window.removeEventListener("pageshow", check);
        window.removeEventListener("pagehide", leave);
      };
    });

    return () => {
      stopped = true;
      stop();
    };
  }, [enabled]);
}
