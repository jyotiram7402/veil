"use client";

import { useEffect, useState } from "react";

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
