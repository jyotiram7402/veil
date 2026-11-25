"use client";

import { useEffect, useId, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Copy, Link as LinkIcon, Loader2, Ticket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { GROUP_FIELD } from "@/components/layout/grouped";
import { useMembers } from "@/components/members/members-provider";
import type { SignupCode } from "@/components/members/types";
import { copyText } from "@/lib/clipboard";
import { apiErrorMessage, cn, normalizeUsernameInput } from "@/lib/utils";

type Step =
  | { kind: "choose" }
  | { kind: "link" }
  | { kind: "code" }
  | { kind: "link-made"; name: string; url: string }
  | { kind: "admin-made"; username: string }
  | { kind: "code-made"; code: string; url: string; label: string | null };

const JSON_HEADERS = { "Content-Type": "application/json" };

const SELECT =
  "h-12 w-full appearance-none rounded-xl border-0 bg-muted pl-4 pr-10 text-base sm:text-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

async function copy(text: string, what: string) {
  if (await copyText(text)) toast.success(`${what} copied`);
  else toast.error("Couldn't copy. Select it and copy it yourself.");
}

export function AddSomeoneDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState<Step>({ kind: "choose" });

  useEffect(() => {
    if (open) setStep({ kind: "choose" });
  }, [open]);

  const close = () => onOpenChange(false);
  const back = () => setStep({ kind: "choose" });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(46rem,calc(100dvh-1.5rem))] w-[calc(100%-1.5rem)] max-w-md flex-col gap-0 overflow-y-auto rounded-[1.75rem] p-0">
        {step.kind === "choose" && <Choose onPick={(kind) => setStep({ kind })} />}
        {step.kind === "link" && <LinkForm onBack={back} onMade={setStep} />}
        {step.kind === "code" && <CodeForm onBack={back} onMade={setStep} />}
        {step.kind === "link-made" && (
          <>
            <StepHeader
              title={`${step.name}'s link is ready`}
              description="Send it with the password you chose. Anyone with both can sign in as them."
            />
            <div className="space-y-4 px-6 pb-6 pt-3">
              <p className="select-all break-all rounded-2xl bg-muted px-4 py-3 text-sm font-medium">
                {step.url}
              </p>
              <div className="grid gap-2">
                <Button size="lg" autoFocus onClick={() => void copy(step.url, "Link")}>
                  <Copy /> Copy link
                </Button>
                <Button size="lg" variant="ghost" onClick={close}>
                  Done
                </Button>
              </div>
            </div>
          </>
        )}
        {step.kind === "admin-made" && (
          <>
            <StepHeader
              title="Admin added"
              description={`@${step.username} signs in at Log in with the password you chose.`}
            />
            <div className="px-6 pb-6 pt-3">
              <Button size="lg" className="w-full" autoFocus onClick={close}>
                Done
              </Button>
            </div>
          </>
        )}
        {step.kind === "code-made" && (
          <>
            <StepHeader
              title="Here's the code"
              description={`${step.label ? `For ${step.label}. ` : ""}Copy it now: for safety it isn't shown again.`}
            />
            <div className="space-y-4 px-6 pb-6 pt-3">
              <p className="select-all break-all rounded-2xl bg-muted px-4 py-5 text-center font-mono text-[1.75rem] font-bold tracking-[0.12em]">
                {step.code}
              </p>
              <p className="text-center text-[13px] text-muted-foreground">
                They type it on the Sign up screen, or open the sign-up link.
              </p>
              <div className="grid gap-2">
                <Button size="lg" autoFocus onClick={() => void copy(step.code, "Code")}>
                  <Copy /> Copy code
                </Button>
                <Button size="lg" variant="secondary" onClick={() => void copy(step.url, "Link")}>
                  <LinkIcon /> Copy sign-up link
                </Button>
                <Button size="lg" variant="ghost" onClick={close}>
                  Done
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StepHeader({
  title,
  description,
  onBack,
}: {
  title: string;
  description?: string;
  onBack?: () => void;
}) {
  return (
    <DialogHeader className="px-6 pr-14 pt-6">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="-ml-2.5 mb-1 grid h-10 w-10 place-items-center rounded-full transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="h-6 w-6" aria-hidden="true" />
        </button>
      )}
      <DialogTitle className="text-xl font-extrabold leading-tight tracking-tight">{title}</DialogTitle>
      {description && (
        <DialogDescription className="leading-relaxed">{description}</DialogDescription>
      )}
    </DialogHeader>
  );
}

function Choose({ onPick }: { onPick: (kind: "link" | "code") => void }) {
  const options = [
    {
      kind: "link" as const,
      icon: LinkIcon,
      title: "Personal link",
      text: "You choose their username and password, then send them the link.",
    },
    {
      kind: "code" as const,
      icon: Ticket,
      title: "Sign-up code",
      text: "They choose their own username and password on the Sign up screen.",
    },
  ];
  return (
    <>
      <StepHeader title="Add someone" description="How should they get in?" />
      <div className="px-4 pb-5 pt-4">
        <div className="overflow-hidden rounded-2xl bg-muted/70">
          {options.map((o) => (
            <button
              key={o.kind}
              type="button"
              onClick={() => onPick(o.kind)}
              className="flex w-full items-center gap-4 border-t border-border/80 px-4 py-4 text-left transition-colors first:border-t-0 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-card">
                <o.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold">{o.title}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
                  {o.text}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-[13px] font-semibold">
        {label}
      </Label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-[13px] leading-snug text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-[13px] font-medium text-destructive">
      {error}
    </p>
  );
}

function LinkForm({ onBack, onMade }: { onBack: () => void; onMade: (step: Step) => void }) {
  const { reload } = useMembers();
  const id = useId();
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const minPassword = isAdmin ? 8 : 4;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const u = normalizeUsernameInput(username);
    if (u.length < 3) {
      setError("The username needs 3 to 24 characters: lowercase letters, numbers or _.");
      return;
    }
    if (password.length < minPassword) {
      setError(`The password needs at least ${minPassword} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          username: u,
          displayName: name.trim() || undefined,
          isAdmin,
          password,
        }),
      });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setError(apiErrorMessage(body, "Couldn't add them. Try again."));
        return;
      }
      void reload();
      const invite = (body as { invite?: { url: string } | null }).invite;
      if (isAdmin) {
        onMade({ kind: "admin-made", username: u });
      } else if (invite) {
        onMade({ kind: "link-made", name: name.trim() || u, url: invite.url });
      } else {
        setError(
          `${name.trim() || u} was added, but their link wasn't made. Open them in Members and use "Make a personal link".`,
        );
      }
    } catch {
      setError("No connection. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <StepHeader title="Personal link" description="They open the link and type the password." onBack={onBack} />
      <form onSubmit={submit} noValidate className="space-y-4 px-6 pb-6 pt-4">
        <Field id={`${id}-user`} label="Username" hint="3 to 24 characters: lowercase letters, numbers or _.">
          <Input
            id={`${id}-user`}
            value={username}
            onChange={(e) => {
              setUsername(normalizeUsernameInput(e.target.value));
              setError(null);
            }}
            placeholder="rahul"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            aria-describedby={`${id}-user-hint`}
            className={GROUP_FIELD}
          />
        </Field>
        <Field id={`${id}-name`} label="Name (optional)" hint="Shown instead of the username.">
          <Input
            id={`${id}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Rahul"
            maxLength={60}
            autoComplete="off"
            aria-describedby={`${id}-name-hint`}
            className={GROUP_FIELD}
          />
        </Field>
        <Field
          id={`${id}-pw`}
          label="Password"
          hint={
            isAdmin
              ? "At least 8 characters. They sign in at Log in with it."
              : "At least 4 characters. They type it after opening the link."
          }
        >
          <Input
            id={`${id}-pw`}
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            autoComplete="new-password"
            aria-describedby={`${id}-pw-hint`}
            className={GROUP_FIELD}
          />
        </Field>
        <label
          htmlFor={`${id}-admin`}
          className="flex cursor-pointer items-center gap-3 rounded-2xl bg-muted/70 px-4 py-3"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">Make them an admin</span>
            <span className="block text-[13px] leading-snug text-muted-foreground">
              Admins sign in at Log in and manage members. No link is made.
            </span>
          </span>
          <Switch id={`${id}-admin`} checked={isAdmin} onCheckedChange={setIsAdmin} />
        </label>
        <FormError error={error} />
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          {isAdmin ? "Add admin" : "Make link"}
        </Button>
      </form>
    </>
  );
}

function CodeForm({ onBack, onMade }: { onBack: () => void; onMade: (step: Step) => void }) {
  const { addCode } = useMembers();
  const id = useId();
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState("1");
  const [expires, setExpires] = useState("7");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/signup-codes", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          label: label.trim() || undefined,
          maxUses: Number(maxUses),
          expiresInDays: expires === "never" ? null : Number(expires),
        }),
      });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setError(apiErrorMessage(body, "Couldn't make the code. Try again."));
        return;
      }
      const made = body as { code: string; url: string; signupCode: SignupCode };
      addCode(made.signupCode);
      onMade({ kind: "code-made", code: made.code, url: made.url, label: label.trim() || null });
    } catch {
      setError("No connection. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <StepHeader
        title="Sign-up code"
        description="They make their own account with it on the Sign up screen."
        onBack={onBack}
      />
      <form onSubmit={submit} noValidate className="space-y-4 px-6 pb-6 pt-4">
        <Field id={`${id}-label`} label="Who is it for? (optional)" hint="Only you see this.">
          <Input
            id={`${id}-label`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Rahul"
            maxLength={60}
            autoComplete="off"
            autoFocus
            aria-describedby={`${id}-label-hint`}
            className={GROUP_FIELD}
          />
        </Field>
        <div className="grid gap-4 min-[420px]:grid-cols-2">
          <Field id={`${id}-uses`} label="Can be used">
            <SelectBox id={`${id}-uses`} value={maxUses} onChange={setMaxUses}>
              <option value="1">Once</option>
              <option value="5">5 times</option>
              <option value="10">10 times</option>
              <option value="25">25 times</option>
            </SelectBox>
          </Field>
          <Field id={`${id}-expires`} label="Stops working">
            <SelectBox id={`${id}-expires`} value={expires} onChange={setExpires}>
              <option value="1">After 1 day</option>
              <option value="7">After 7 days</option>
              <option value="30">After 30 days</option>
              <option value="never">Never</option>
            </SelectBox>
          </Field>
        </div>
        <FormError error={error} />
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          Make code
        </Button>
      </form>
    </>
  );
}

function SelectBox({
  id,
  value,
  onChange,
  children,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={cn(SELECT)}>
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}
