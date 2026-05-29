"use client";

import { useEffect, useState } from "react";
import { Eye, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Admin-side screen guard: opaque cover the instant the window loses focus
 * or developer tools open. No password required to resume (admin is already
 * trusted). For the user-facing chat, use <SessionLock> instead — it does
 * the same thing but requires a password to come back.
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
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    const onVis = () => setHidden(document.visibilityState === "hidden");
    const onBlur = () => setHidden(true);
    const onFocus = () => {
      setHidden(false);
      setReveal(false);
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && (k === "s" || k === "p" || k === "u")) {
        e.preventDefault();
      }
      if (k === "printscreen" || e.code === "PrintScreen") {
        e.preventDefault();
        navigator.clipboard?.writeText(" ").catch(() => undefined);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  const showCover = (hidden || devtools) && !reveal;

  return (
    <div
      className="relative h-full w-full select-none"
      onContextMenu={(e) => e.preventDefault()}
      onCopy={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      style={{ WebkitUserSelect: "none", userSelect: "none" }}
    >
      <div className={showCover ? "invisible pointer-events-none" : ""}>{children}</div>

      <WatermarkLayer label={watermark} />

      {showCover && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-background text-center px-6">
          <div>
            <ShieldAlert className="mx-auto h-10 w-10 text-amber-400 mb-3" />
            <p className="font-medium">Paused for privacy</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-xs">
              {devtools
                ? "Developer tools detected. Close them to continue."
                : "Return to this window to resume the conversation."}
            </p>
            <Button
              onClick={() => setReveal(true)}
              variant="ghost"
              size="sm"
              className="mt-4"
            >
              <Eye className="h-4 w-4" /> Show anyway
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function WatermarkLayer({ label }: { label: string }) {
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
