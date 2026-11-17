"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/chat/user-avatar";
import { useCallStore } from "@/store/call-store";
import { useSessionStore } from "@/store/session-store";
import type { Profile } from "@/types/chat";

export function SessionLock({
  me,
  children,
}: {
  me: Profile;
  children: React.ReactNode;
}) {
  const [locked, setLocked] = useState(true);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    useSessionStore.getState().setLocked(locked);
  }, [locked]);
  useLayoutEffect(() => () => useSessionStore.getState().setLocked(false), []);

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

  useEffect(() => {
    const relock = () => {
      useSessionStore.getState().setLocked(true);
      setLocked(true);
      setPassword("");
      setError(null);
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") relock();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", relock);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", relock);
    };
  }, []);

  useEffect(() => {
    if (locked) {
      const t = window.setTimeout(() => {
        const call = useCallStore.getState();
        if (call.state === "idle" || call.minimized) inputRef.current?.focus();
      }, 50);
      return () => window.clearTimeout(t);
    }
  }, [locked]);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!password || submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch("/api/lock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        if (res.ok) {
          setLocked(false);
          setPassword("");
          window.dispatchEvent(new Event("blackfoxx:resume"));
          return;
        }
        if (res.status === 401) {
          setError("Wrong password.");
        } else if (res.status === 429) {
          setError("Too many attempts. Wait a minute.");
        } else {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setError(body.error ?? "Couldn't unlock.");
        }
      } finally {
        setSubmitting(false);
      }
    },
    [password, submitting],
  );

  return (
    <div className="relative h-full w-full" onContextMenu={(e) => e.preventDefault()}>
      <div className={locked ? "invisible select-none pointer-events-none" : "h-full"}>
        {children}
      </div>

      {locked && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-background px-6">
          <form onSubmit={submit} className="w-full max-w-sm">
            <div className="flex flex-col items-center text-center mb-8">
              <UserAvatar
                userId={me.id}
                username={me.username}
                displayName={me.display_name}
                avatarUrl={me.avatar_url}
                size="xl"
              />
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Lock className="h-3.5 w-3.5" />
                <span>Locked</span>
              </div>
              <h1 className="mt-2 text-lg font-semibold">
                {me.display_name ?? me.username}
              </h1>
            </div>

            <div className="glass rounded-2xl p-6 space-y-4">
              <Input
                ref={inputRef}
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={!password || submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Unlock"}
              </Button>
            </div>

            <p className="mt-6 text-center text-[11px] text-muted-foreground">
              The chat re-locks the moment you switch tabs or look away.
            </p>
          </form>
        </div>
      )}
    </div>
  );
}
