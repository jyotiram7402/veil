"use client";

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";

/**
 * Best-effort anti-leak overlay. We can't actually prevent screenshots on
 * the web (the browser doesn't expose that API), but we can:
 *  - Blur all content the instant the window loses focus (defeats casual
 *    screenshot-while-tabbing, screen-share previews, OS app-switcher
 *    thumbnails on most platforms).
 *  - Disable the right-click menu and text selection on the chat surface.
 *  - Block Ctrl+S / Cmd+S, Ctrl+P / Cmd+P.
 *  - Overlay a faint diagonal watermark with the user identity so any
 *    leaked photo is traceable.
 *  - Cover the screen if DevTools opens (heuristic; not foolproof).
 *
 * What this does NOT do: prevent OS-level Print Screen, the iOS/Android
 * screenshot button, screen-recording, or photographing the screen with
 * another device. For that, you'd need a native app with the equivalent of
 * iOS `screenCaptureDidChange` / Android `FLAG_SECURE`. We can't from a
 * browser.
 */
export function ScreenGuard({
  children,
  watermark,
}: {
  children: React.ReactNode;
  watermark: string;
}) {
  const [hidden, setHidden] = useState(false);
  const [devtools, setDevtools] = useState(false);

  // hide on focus loss
  useEffect(() => {
    const onVis = () => setHidden(document.visibilityState === "hidden");
    const onBlur = () => setHidden(true);
    const onFocus = () => setHidden(false);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // crude devtools heuristic
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      if (cancelled) return;
      const threshold = 160;
      const diffW = window.outerWidth - window.innerWidth;
      const diffH = window.outerHeight - window.innerHeight;
      setDevtools(diffW > threshold || diffH > threshold);
    };
    check();
    const id = window.setInterval(check, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // block save/print shortcuts and printscreen-ish keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && (k === "s" || k === "p")) {
        e.preventDefault();
      }
      // best-effort: catch PrintScreen if the browser surfaces it (most don't)
      if (k === "printscreen" || e.code === "PrintScreen") {
        e.preventDefault();
        // wipe clipboard, in case anything landed there
        navigator.clipboard?.writeText(" ").catch(() => undefined);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const showCover = hidden || devtools;

  return (
    <div
      className="relative h-full w-full select-none"
      onContextMenu={(e) => e.preventDefault()}
      onCopy={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      style={{ WebkitUserSelect: "none", userSelect: "none" }}
    >
      <div style={{ filter: showCover ? "blur(18px) brightness(0.4)" : undefined }}>
        {children}
      </div>

      {/* Watermark layer — sits above content, ignores pointer events */}
      <WatermarkLayer label={watermark} />

      {showCover && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-background/70 backdrop-blur-md text-center px-6">
          <div>
            <ShieldAlert className="mx-auto h-10 w-10 text-amber-400 mb-3" />
            <p className="font-medium">Paused for privacy</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-xs">
              {devtools
                ? "Developer tools detected. Close them to continue."
                : "Return to this window to resume the conversation."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function WatermarkLayer({ label }: { label: string }) {
  // 5x5 grid of rotated watermarks — covers the screen, semi-transparent.
  const cells = Array.from({ length: 30 });
  const now = new Date().toLocaleString();
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden mix-blend-overlay opacity-[0.06]"
    >
      <div
        className="absolute inset-0 grid"
        style={{ gridTemplateColumns: "repeat(5, 1fr)", gridTemplateRows: "repeat(6, 1fr)" }}
      >
        {cells.map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-center"
            style={{ transform: "rotate(-28deg)" }}
          >
            <span className="text-xs whitespace-nowrap font-semibold text-foreground">
              {label} · {now}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
