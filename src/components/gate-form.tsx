"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { ENTRY_SUBMIT } from "@/components/auth/field";
import { PasswordInput } from "@/components/auth/password-input";
import { UserAvatar } from "@/components/chat/user-avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/** Message for the ?error= code the gate route redirects back with. */
function errorMessage(code: string | undefined): string | undefined {
  if (code === "invalid") return "That password doesn't match. Try again.";
  if (code === "locked") return "Too many attempts. Wait a minute and try again.";
  return undefined;
}

export function GateForm({
  token,
  userId,
  displayName,
  username,
  avatarUrl,
  error,
}: {
  token: string;
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  error?: string;
}) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const errorText = errorMessage(error);

  return (
    <form action={`/api/i/${token}`} method="POST" onSubmit={() => setSubmitting(true)}>
      <div className="flex items-center gap-4">
        <UserAvatar
          userId={userId}
          username={username}
          displayName={displayName}
          avatarUrl={avatarUrl}
          size="xl"
        />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold leading-tight tracking-tight">
            Hi, {displayName}
          </h1>
          <p className="truncate text-[15px] text-muted-foreground">@{username}</p>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        <Label htmlFor="password">Your password</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          autoFocus
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          enterKeyHint="go"
          aria-invalid={!!errorText}
          aria-describedby={errorText ? "password-error" : undefined}
        />
        {errorText && (
          <p id="password-error" role="alert" className="text-[13px] font-medium text-destructive">
            {errorText}
          </p>
        )}
      </div>

      <Button type="submit" className={`mt-5 ${ENTRY_SUBMIT}`} disabled={submitting || !password}>
        {submitting ? <Loader2 className="animate-spin" aria-label="Opening your chat" /> : "Continue"}
      </Button>

      <p className="mt-5 text-center text-[13px] leading-relaxed text-muted-foreground">
        This link is yours alone. Don&apos;t share it or your password.
      </p>
    </form>
  );
}
