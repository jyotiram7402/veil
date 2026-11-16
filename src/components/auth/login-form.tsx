"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ENTRY_FIELD, ENTRY_SUBMIT } from "@/components/auth/field";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { passwordProblem, usernameProblem } from "@/lib/entry-checks";
import { apiErrorMessage, normalizeUsernameInput } from "@/lib/utils";

type Errors = { username?: string; password?: string; form?: string };

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    // Read the fields themselves, not only our state: a browser can autofill
    // them without firing the change events React listens for.
    const data = new FormData(e.currentTarget);
    const credentials = {
      username: normalizeUsernameInput(String(data.get("username") ?? username)),
      password: String(data.get("password") ?? password),
    };
    const problems = {
      username: usernameProblem(credentials.username),
      password: passwordProblem(credentials.password),
    };
    if (problems.username || problems.password) {
      setErrors(problems);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null);
        setErrors({
          form:
            res.status === 401
              ? "Wrong username or password. Check both and try again."
              : apiErrorMessage(body, "Couldn't log you in. Try again in a moment."),
        });
        setSubmitting(false);
        return;
      }
    } catch {
      setErrors({ form: "No connection. Check your internet and try again." });
      setSubmitting(false);
      return;
    }

    // Open-redirect guard: only same-origin absolute paths. Reject "//host",
    // "/\\host", and anything that isn't a plain "/path".
    const safeNext = nextPath && /^\/(?!\/|\\)/.test(nextPath) ? nextPath : "/chats";
    // The button keeps spinning until the next page takes over.
    router.replace(safeNext);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          value={username}
          onChange={(e) => setUsername(normalizeUsernameInput(e.target.value))}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          className={ENTRY_FIELD}
          aria-invalid={!!errors.username}
          aria-describedby={errors.username ? "username-error" : undefined}
        />
        {errors.username && (
          <p id="username-error" className="text-[13px] font-medium text-destructive">
            {errors.username}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          enterKeyHint="go"
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? "password-error" : undefined}
        />
        {errors.password && (
          <p id="password-error" className="text-[13px] font-medium text-destructive">
            {errors.password}
          </p>
        )}
      </div>

      {errors.form && (
        <p
          role="alert"
          className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
        >
          {errors.form}
        </p>
      )}

      <Button type="submit" className={ENTRY_SUBMIT} disabled={submitting}>
        {submitting ? <Loader2 className="animate-spin" aria-label="Logging in" /> : "Log in"}
      </Button>
    </form>
  );
}
