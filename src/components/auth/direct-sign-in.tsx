"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ENTRY_FIELD, ENTRY_SUBMIT } from "@/components/auth/field";
import { UserAvatar } from "@/components/chat/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiErrorMessage, cn } from "@/lib/utils";

function hashcodeFromLink(): string {
  const raw = window.location.hash.slice(1);
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function DirectSignIn({
  token,
  userId,
  username,
  displayName,
  avatarUrl,
}: {
  token: string;
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const id = useId();
  const [hashcode, setHashcode] = useState("");
  const [filledIn, setFilledIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const name = displayName?.trim() || username;

  useEffect(() => {
    const fromLink = hashcodeFromLink();
    if (!fromLink) return;
    setHashcode(fromLink);
    setFilledIn(true);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!hashcode) {
      setError("Type your hashcode.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/d/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hashcode }),
      });
      if (res.ok) {
        router.replace("/chat");
        router.refresh();
        return;
      }
      const body: unknown = await res.json().catch(() => null);
      if (res.status === 410) setGone(true);
      setError(apiErrorMessage(body, "Couldn't sign you in. Try again in a moment."));
    } catch {
      setError("No connection. Check your internet and try again.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={start} noValidate>
      <div className="flex items-center gap-4">
        <UserAvatar
          userId={userId}
          username={username}
          displayName={displayName}
          avatarUrl={avatarUrl}
          size="xl"
        />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold leading-tight tracking-tight">Hi, {name}</h1>
          <p className="truncate text-[15px] text-muted-foreground">@{username}</p>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        <Label htmlFor={`${id}-hashcode`}>Your hashcode</Label>
        <Input
          id={`${id}-hashcode`}
          value={hashcode}
          onChange={(e) => {
            setHashcode(e.target.value);
            setError(null);
          }}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={128}
          enterKeyHint="go"
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
          className={cn(ENTRY_FIELD, "h-16 text-center text-2xl font-bold tracking-wide sm:text-2xl")}
        />
        <p id={`${id}-hint`} className="text-[13px] leading-relaxed text-muted-foreground">
          {filledIn
            ? "Remember it. Next time you sign in with your name and this hashcode."
            : "Type the hashcode the admin gave you."}
        </p>
      </div>

      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
        >
          {error}
        </p>
      )}

      {gone ? (
        <Button asChild className={`mt-5 ${ENTRY_SUBMIT}`}>
          <Link href="/enter">Go to User login</Link>
        </Button>
      ) : (
        <Button type="submit" className={`mt-5 ${ENTRY_SUBMIT}`} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-label="Signing in" /> : "Start"}
        </Button>
      )}

      <p className="mt-5 text-center text-[13px] leading-relaxed text-muted-foreground">
        This link is yours alone and works once. Don&apos;t share it.
      </p>
    </form>
  );
}
