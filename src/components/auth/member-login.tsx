"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ENTRY_FIELD, ENTRY_SUBMIT } from "@/components/auth/field";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiErrorMessage } from "@/lib/utils";

type Mode = "login" | "forgot" | "sent";

const JSON_HEADERS = { "Content-Type": "application/json" };

const TEXT_BUTTON =
  "rounded-sm text-[15px] font-semibold text-foreground underline decoration-2 underline-offset-4 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function MemberLogin() {
  const router = useRouter();
  const id = useId();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [hashcode, setHashcode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchTo(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim() || !hashcode) {
      setError(!name.trim() ? "Type your name." : "Type your hashcode.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/member-login", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name: name.trim(), hashcode }),
      });
      if (res.ok) {
        router.replace("/chat");
        router.refresh();
        return;
      }
      const body: unknown = await res.json().catch(() => null);
      setError(apiErrorMessage(body, "Couldn't sign you in. Try again in a moment."));
    } catch {
      setError("No connection. Check your internet and try again.");
    }
    setBusy(false);
  }

  async function askAdmin(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) {
      setError("Type your name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        switchTo("sent");
      } else {
        const body: unknown = await res.json().catch(() => null);
        setError(apiErrorMessage(body, "Couldn't send the request. Try again in a moment."));
      }
    } catch {
      setError("No connection. Check your internet and try again.");
    }
    setBusy(false);
  }

  const errorLine = error && (
    <p
      id={`${id}-error`}
      role="alert"
      className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
    >
      {error}
    </p>
  );

  const nameField = (
    <div className="space-y-2">
      <Label htmlFor={`${id}-name`}>Name</Label>
      <Input
        id={`${id}-name`}
        name="username"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={60}
        enterKeyHint={mode === "login" ? "next" : "send"}
        className={ENTRY_FIELD}
        aria-describedby={error ? `${id}-error` : undefined}
      />
    </div>
  );

  if (mode === "sent") {
    return (
      <div>
        <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight">Request sent</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">
          When the admin has checked it&apos;s really you, they&apos;ll send you a direct link. Open
          it and your hashcode is already filled in. Remember it: you need it with your name next
          time.
        </p>
        <Button type="button" className={`mt-6 ${ENTRY_SUBMIT}`} onClick={() => switchTo("login")}>
          Back to User login
        </Button>
      </div>
    );
  }

  if (mode === "forgot") {
    return (
      <form onSubmit={askAdmin} noValidate>
        <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight">
          Forgot your hashcode?
        </h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">
          Type your name. The admin checks it&apos;s you and sends you a direct link with your
          hashcode in it.
        </p>
        <div className="mt-6 space-y-4">
          {nameField}
          {errorLine}
          <Button type="submit" className={ENTRY_SUBMIT} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" aria-label="Sending" /> : "Ask the admin"}
          </Button>
        </div>
        <p className="mt-6 text-center">
          <button type="button" className={TEXT_BUTTON} onClick={() => switchTo("login")}>
            Back to User login
          </button>
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={signIn} noValidate>
      <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight">User login</h1>
      <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">
        Type your name and the hashcode the admin gave you.
      </p>
      <div className="mt-6 space-y-4">
        {nameField}
        <div className="space-y-2">
          <Label htmlFor={`${id}-hashcode`}>Hashcode</Label>
          <PasswordInput
            id={`${id}-hashcode`}
            name="password"
            what="hashcode"
            value={hashcode}
            onChange={(e) => {
              setHashcode(e.target.value);
              setError(null);
            }}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={128}
            enterKeyHint="go"
            aria-describedby={error ? `${id}-error` : undefined}
          />
        </div>
        {errorLine}
        <Button type="submit" className={ENTRY_SUBMIT} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-label="Signing in" /> : "Start"}
        </Button>
      </div>
      <p className="mt-6 text-center">
        <button type="button" className={TEXT_BUTTON} onClick={() => switchTo("forgot")}>
          Forgot hashcode?
        </button>
      </p>
    </form>
  );
}
