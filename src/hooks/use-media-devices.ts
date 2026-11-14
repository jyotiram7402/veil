"use client";

import { useEffect, useState } from "react";

/**
 * The cameras, microphones and speakers the browser reports, kept up to date
 * while `active` (something is plugged in or unplugged). Pass anything as
 * `refreshKey` to read the list again when it changes: names and extra cameras
 * only show up once the camera has been used.
 */
export function useMediaDevices(active: boolean, refreshKey?: unknown): MediaDeviceInfo[] {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    if (!active) return;
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md || typeof md.enumerateDevices !== "function") return;

    let cancelled = false;
    const read = () => {
      md.enumerateDevices().then(
        (list) => {
          if (!cancelled) setDevices(list);
        },
        () => undefined,
      );
    };
    read();
    md.addEventListener?.("devicechange", read);
    return () => {
      cancelled = true;
      md.removeEventListener?.("devicechange", read);
    };
  }, [active, refreshKey]);

  return devices;
}
