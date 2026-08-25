"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_NAME } from "@/lib/constants";

export function JoinForm({ initialCode = "" }: { initialCode?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          displayName: displayName.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Invalid or expired invitation.");
        return;
      }
      const body = (await res.json()) as { redirect: string };
      router.replace(body.redirect);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm">
      <div className="flex flex-col items-center text-center mb-8">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">Private Room</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter your access code to join. No account needed.
        </p>
      </div>

      <div className="glass rounded-2xl p-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="code">Access code</Label>
          <div className="relative">
            <KeyRound className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              id="code"
              name="code"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              autoFocus={!initialCode}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="pl-9 font-mono text-xs"
              placeholder="••••••••••••"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="displayName">Display name (optional)</Label>
          <Input
            id="displayName"
            name="displayName"
            autoComplete="off"
            maxLength={40}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Rahul"
          />
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <Button type="submit" className="w-full" disabled={submitting || !code.trim()}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Join Room"}
        </Button>
      </div>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Lock className="h-3 w-3" /> Your access code is private to you — don&apos;t share it.
      </p>
      <p className="mt-2 text-center text-[11px] text-muted-foreground/70">{APP_NAME}</p>
    </form>
  );
}
