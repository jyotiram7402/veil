"use client";

import { useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/chat/user-avatar";

export function GateForm({
  token,
  displayName,
  username,
  avatarUrl,
  error,
}: {
  token: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  error?: string;
}) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      action={`/api/i/${token}`}
      method="POST"
      onSubmit={() => setSubmitting(true)}
      className="w-full max-w-sm"
    >
      <div className="flex flex-col items-center text-center mb-8">
        <UserAvatar
          username={username}
          displayName={displayName}
          avatarUrl={avatarUrl}
          size="xl"
        />
        <h1 className="mt-4 text-xl font-semibold">{displayName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">@{username}</p>
      </div>

      <div className="glass rounded-2xl p-6 space-y-4">
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-foreground/90">
            Enter your password
          </label>
          <div className="relative">
            <Lock className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-9"
              placeholder="••••••••"
            />
          </div>
          {error === "invalid" && (
            <p className="text-xs text-destructive">That password doesn&apos;t match. Try again.</p>
          )}
          {error === "locked" && (
            <p className="text-xs text-destructive">Too many attempts. Wait a minute and try again.</p>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={submitting || !password}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
        </Button>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        This link is yours alone. Don&apos;t share it or your password.
      </p>
    </form>
  );
}
