"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ENTRY_FIELD, ENTRY_SUBMIT } from "@/components/auth/field";
import { PasswordInput } from "@/components/auth/password-input";
import { MojiChooser } from "@/components/moji-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MOJI, MOJI_COLORS, autoMojiChoice, mojiValue, type MojiChoice } from "@/lib/moji";
import { formatSignupCode } from "@/lib/signup-code";
import { apiErrorMessage, cn, normalizeUsernameInput } from "@/lib/utils";
import { signupSchema } from "@/lib/validations";

type Errors = {
  code?: string;
  username?: string;
  displayName?: string;
  password?: string;
  form?: string;
};

const ERROR_TEXT = "text-[13px] font-medium text-destructive";
const HINT_TEXT = "text-[13px] text-muted-foreground";

export function SignupForm({ initialCode }: { initialCode?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(() => formatSignupCode(initialCode ?? ""));
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  // Until they choose one themselves, the avatar follows the username.
  const [picked, setPicked] = useState<MojiChoice | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const avatar = picked ?? autoMojiChoice(username || "new");
  const avatarEntry = MOJI.find((m) => m.id === avatar.id) ?? MOJI[0]!;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    const parsed = signupSchema.safeParse({
      code,
      username,
      password,
      displayName,
      avatar: mojiValue(avatar.id, avatar.color),
    });
    if (!parsed.success) {
      const f = parsed.error.flatten().fieldErrors;
      setErrors({
        code: f.code?.[0],
        username: f.username?.[0],
        displayName: f.displayName?.[0],
        password: f.password?.[0],
      });
      return;
    }

    setErrors({});
    setSubmitting(true);
    let signedIn = false;
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message = apiErrorMessage(body, "Couldn't create your account. Try again in a moment.");
        // Put the message next to the field it is about.
        if (res.status === 400) setErrors({ code: message });
        else if (res.status === 409) setErrors({ username: message });
        else setErrors({ form: message });
        setSubmitting(false);
        return;
      }
      signedIn = Boolean((body as { signedIn?: boolean } | null)?.signedIn);
    } catch {
      setErrors({ form: "No connection. Check your internet and try again." });
      setSubmitting(false);
      return;
    }

    // The button keeps spinning until the next page takes over.
    router.replace(signedIn ? "/chat" : "/login");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="code">Invite code</Label>
        <Input
          id="code"
          name="code"
          value={code}
          onChange={(e) => setCode(formatSignupCode(e.target.value))}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          placeholder="XXXXX-XXXXX"
          className={cn(ENTRY_FIELD, "font-semibold tracking-[0.12em] placeholder:font-normal")}
          aria-invalid={!!errors.code}
          aria-describedby={errors.code ? "code-error" : undefined}
        />
        {errors.code && (
          <p id="code-error" className={ERROR_TEXT}>
            {errors.code}
          </p>
        )}
      </div>

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
          aria-describedby={errors.username ? "username-error" : "username-hint"}
        />
        {errors.username ? (
          <p id="username-error" className={ERROR_TEXT}>
            {errors.username}
          </p>
        ) : (
          <p id="username-hint" className={HINT_TEXT}>
            3 to 24 lowercase letters, numbers or _. You log in with it.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="displayName">
          Your name <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="displayName"
          name="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          autoComplete="name"
          maxLength={40}
          enterKeyHint="next"
          className={ENTRY_FIELD}
          aria-invalid={!!errors.displayName}
          aria-describedby={errors.displayName ? "displayName-error" : undefined}
        />
        {errors.displayName && (
          <p id="displayName-error" className={ERROR_TEXT}>
            {errors.displayName}
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
          autoComplete="new-password"
          enterKeyHint="go"
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? "password-error" : "password-hint"}
        />
        {errors.password ? (
          <p id="password-error" className={ERROR_TEXT}>
            {errors.password}
          </p>
        ) : (
          <p id="password-hint" className={HINT_TEXT}>
            At least 8 characters.
          </p>
        )}
      </div>

      <div className="flex items-center gap-4 rounded-2xl bg-muted p-3">
        <span
          aria-hidden="true"
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full text-[30px] leading-none"
          style={{ backgroundColor: MOJI_COLORS[avatar.color] }}
        >
          {avatarEntry.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Your avatar</p>
          <p className={HINT_TEXT}>{avatarEntry.name}. You can change it any time.</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-9 bg-card shadow-none hover:bg-card/80"
          onClick={() => setPickerOpen(true)}
        >
          Change
        </Button>
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
        {submitting ? (
          <Loader2 className="animate-spin" aria-label="Creating your account" />
        ) : (
          "Create account"
        )}
      </Button>

      <MojiChooser
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        value={avatar}
        confirmLabel="Use this one"
        onConfirm={(choice) => {
          setPicked(choice);
          setPickerOpen(false);
        }}
      />
    </form>
  );
}
