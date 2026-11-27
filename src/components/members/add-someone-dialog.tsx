"use client";

import { useEffect, useId, useState } from "react";
import { Loader2 } from "lucide-react";
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
import { LinkBox } from "@/components/members/link-box";
import { useMembers } from "@/components/members/members-provider";
import { INVITE_HOURS } from "@/lib/invite-window";
import { apiErrorMessage, normalizeUsernameInput } from "@/lib/utils";

type Step =
  | { kind: "form" }
  | { kind: "link-made"; name: string; username: string; url: string }
  | { kind: "admin-made"; username: string };

const JSON_HEADERS = { "Content-Type": "application/json" };

export function AddSomeoneDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState<Step>({ kind: "form" });

  useEffect(() => {
    if (open) setStep({ kind: "form" });
  }, [open]);

  const close = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(46rem,calc(100dvh-1.5rem))] w-[calc(100%-1.5rem)] max-w-md flex-col gap-0 overflow-y-auto rounded-[1.75rem] p-0 outline-none">
        {step.kind === "form" && <AddForm onMade={setStep} />}
        {step.kind === "link-made" && (
          <>
            <StepHeader
              title={`${step.name}'s invite link is ready`}
              description={`It works for ${INVITE_HOURS} hours. Send it with their name (${step.username}) and their hashcode: they need both to sign in.`}
            />
            <div className="space-y-2 px-6 pb-6 pt-3">
              <LinkBox url={step.url} autoFocus />
              <Button size="lg" variant="ghost" className="w-full" onClick={close}>
                Done
              </Button>
            </div>
          </>
        )}
        {step.kind === "admin-made" && (
          <>
            <StepHeader
              title="Admin added"
              description={`@${step.username} signs in at Admin login with the password you chose.`}
            />
            <div className="px-6 pb-6 pt-3">
              <Button size="lg" className="w-full" autoFocus onClick={close}>
                Done
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StepHeader({ title, description }: { title: string; description?: string }) {
  return (
    <DialogHeader className="px-6 pr-14 pt-6">
      <DialogTitle className="text-xl font-extrabold leading-tight tracking-tight">{title}</DialogTitle>
      {description && (
        <DialogDescription className="leading-relaxed">{description}</DialogDescription>
      )}
    </DialogHeader>
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

function AddForm({ onMade }: { onMade: (step: Step) => void }) {
  const { reload } = useMembers();
  const id = useId();
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const minSecret = isAdmin ? 8 : 4;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const u = normalizeUsernameInput(username);
    if (u.length < 3) {
      setError("The username needs 3 to 24 characters: lowercase letters, numbers or _.");
      return;
    }
    if (secret.trim().length < minSecret) {
      setError(
        isAdmin
          ? "The password needs at least 8 characters."
          : "The hashcode needs at least 4 characters.",
      );
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
          password: isAdmin ? secret : secret.trim(),
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
        onMade({ kind: "link-made", name: name.trim() || u, username: u, url: invite.url });
      } else {
        setError(
          `${name.trim() || u} was added, but their link wasn't made. Open them in Members and use "Make an invite link".`,
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
      <StepHeader
        title="Add someone"
        description={`Choose their name and hashcode. They get an invite link that works for ${INVITE_HOURS} hours.`}
      />
      <form onSubmit={submit} noValidate className="space-y-4 px-6 pb-6 pt-4">
        <Field
          id={`${id}-user`}
          label="Username"
          hint="They type this as their name. 3 to 24 characters: lowercase letters, numbers or _."
        >
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
        <Field id={`${id}-name`} label="Name (optional)" hint="Shown in chats. They can sign in with it too.">
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
          id={`${id}-secret`}
          label={isAdmin ? "Password" : "Hashcode"}
          hint={
            isAdmin
              ? "At least 8 characters. They sign in at Admin login with it."
              : "At least 4 characters, emoji too, like Hi😂. Only you can set or change it."
          }
        >
          <Input
            id={`${id}-secret`}
            type={isAdmin ? "password" : "text"}
            value={secret}
            onChange={(e) => {
              setSecret(e.target.value);
              setError(null);
            }}
            autoComplete={isAdmin ? "new-password" : "off"}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={128}
            aria-describedby={`${id}-secret-hint`}
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
              Admins sign in at Admin login and manage members. No link is made.
            </span>
          </span>
          <Switch id={`${id}-admin`} checked={isAdmin} onCheckedChange={setIsAdmin} />
        </label>
        {error && (
          <p role="alert" className="text-[13px] font-medium text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          {isAdmin ? "Add admin" : "Make invite link"}
        </Button>
      </form>
    </>
  );
}
