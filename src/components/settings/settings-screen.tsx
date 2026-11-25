"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AtSign, Camera, KeyRound, Loader2, RefreshCw, Smile, TextCursorInput } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm, type ConfirmOptions } from "@/components/ui/confirm-dialog";
import { UserAvatar } from "@/components/chat/user-avatar";
import { MojiPicker } from "@/components/moji-picker";
import { ScreenHeader } from "@/components/layout/screen-header";
import {
  GROUP_FIELD,
  Group,
  GroupButtonRow,
  GroupDisclosureRow,
  GroupRow,
} from "@/components/layout/grouped";
import {
  CHAT_RULES,
  DISAPPEARING_CONFIRM,
  clampLength,
  everyoneLength,
  everyoneValue,
} from "@/components/settings/chat-rules";
import { LengthInput } from "@/components/settings/length-input";
import { useSessionStore } from "@/store/session-store";
import { AVATAR_MAX_BYTES, IMAGE_MIME_TYPES } from "@/lib/constants";
import { apiErrorMessage, formatBytes, normalizeUsernameInput } from "@/lib/utils";
import type { Profile } from "@/types/chat";

const JSON_HEADERS = { "Content-Type": "application/json" };

const LINK =
  "rounded font-semibold text-foreground underline underline-offset-2 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Settings: you (profile, how you sign in) and the chat rules for everyone.
 * One person's own rules are on their screen in Members.
 */
export function SettingsScreen({ me }: { me: Profile }) {
  const profile = useSessionStore((s) => s.profile) ?? me;
  const { confirm, dialog } = useConfirm();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader
        title="Settings"
        back={{ href: "/chats", label: "Back to chats", hideFrom: "md" }}
      />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-xl space-y-8 px-4 pb-12 pt-1 sm:px-6">
          <ProfileGroup profile={profile} />
          {profile.is_admin && <SignInGroup profile={profile} />}
          {profile.is_admin && <RulesGroup confirm={confirm} />}
        </div>
      </div>
      {dialog}
    </div>
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
  hint?: React.ReactNode;
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

// ---------------------------------------------------------------------------

function ProfileGroup({ profile }: { profile: Profile }) {
  const router = useRouter();
  const patchProfile = useSessionStore((s) => s.patchProfile);
  const id = useId();
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty =
    displayName.trim() !== (profile.display_name ?? "") || bio.trim() !== (profile.bio ?? "");

  async function onAvatarPick(file: File) {
    if (!IMAGE_MIME_TYPES.includes(file.type)) {
      toast.error("Pick a PNG, JPEG, WebP or GIF.");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast.error(`That photo is too large. The most is ${formatBytes(AVATAR_MAX_BYTES)}.`);
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "avatar");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null);
        toast.error(apiErrorMessage(body, "The photo didn't upload. Try again."));
        return;
      }
      const { url } = (await res.json()) as { url: string };
      const save = await fetch("/api/profile", {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ avatarUrl: url }),
      });
      if (!save.ok) {
        toast.error("The photo uploaded but didn't become your picture. Try again.");
        return;
      }
      const { profile: next } = (await save.json()) as { profile: Profile };
      patchProfile(next);
      router.refresh();
      toast.success("Photo updated");
    } catch {
      toast.error("No connection. Check your internet and try again.");
    } finally {
      setUploading(false);
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: JSON_HEADERS,
        // Empty strings are sent on purpose: they clear the field.
        body: JSON.stringify({ displayName: displayName.trim(), bio: bio.trim() }),
      });
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null);
        toast.error(apiErrorMessage(body, "Couldn't save. Try again."));
        return;
      }
      const { profile: next } = (await res.json()) as { profile: Profile };
      patchProfile(next);
      router.refresh();
      toast.success("Profile saved");
    } catch {
      toast.error("No connection. Check your internet and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Group title="Profile">
      <div className="flex items-center gap-4 px-4 py-4">
        <UserAvatar
          userId={profile.id}
          username={profile.username}
          displayName={profile.display_name}
          avatarUrl={profile.avatar_url}
          size="xl"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold">{profile.display_name || profile.username}</p>
          <p className="truncate text-[13px] text-muted-foreground">@{profile.username}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setPickerOpen(true)}>
              <Smile /> Emoji avatar
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="animate-spin" /> : <Camera />} Photo
            </Button>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void onAvatarPick(f);
          }}
        />
      </div>
      <form onSubmit={onSave} className="space-y-4 border-t border-border/70 px-4 pb-4 pt-4">
        <Field id={`${id}-name`} label="Display name" hint="Shown instead of your username.">
          <Input
            id={`${id}-name`}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={profile.username}
            maxLength={60}
            aria-describedby={`${id}-name-hint`}
            className={GROUP_FIELD}
          />
        </Field>
        <Field
          id={`${id}-bio`}
          label="Bio"
          hint={<span className="tabular-nums">{bio.length}/280 · people see it on your profile</span>}
        >
          <Textarea
            id={`${id}-bio`}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A line about you"
            maxLength={280}
            rows={3}
            aria-describedby={`${id}-bio-hint`}
            className="rounded-xl border-transparent bg-muted px-4 py-3 shadow-none"
          />
        </Field>
        <Button type="submit" disabled={saving || !dirty}>
          {saving && <Loader2 className="animate-spin" />}
          Save profile
        </Button>
      </form>
      <MojiPicker open={pickerOpen} onOpenChange={setPickerOpen} profile={profile} />
    </Group>
  );
}

// ---------------------------------------------------------------------------

function SignInGroup({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState<"username" | "password" | null>(null);
  return (
    <Group title="Sign-in">
      <GroupDisclosureRow
        icon={AtSign}
        title="Username"
        description={`@${profile.username} · you sign in with it at Log in`}
        open={open === "username"}
        onOpenChange={(next) => setOpen(next ? "username" : null)}
      >
        <UsernameForm current={profile.username} onDone={() => setOpen(null)} />
      </GroupDisclosureRow>
      <GroupDisclosureRow
        icon={KeyRound}
        title="Password"
        description="Change the password you sign in with."
        open={open === "password"}
        onOpenChange={(next) => setOpen(next ? "password" : null)}
      >
        <PasswordForm onDone={() => setOpen(null)} />
      </GroupDisclosureRow>
    </Group>
  );
}

function UsernameForm({ current, onDone }: { current: string; onDone: () => void }) {
  const router = useRouter();
  const patchProfile = useSessionStore((s) => s.patchProfile);
  const id = useId();
  const [username, setUsername] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (username === current) return onDone();
    if (username.length < 3) {
      setError("Use 3 to 24 characters: lowercase letters, numbers or _.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/me", {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ username }),
      });
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null);
        setError(apiErrorMessage(body, "Couldn't change it. Try again."));
        return;
      }
      patchProfile({ username });
      router.refresh();
      toast.success(`From now on you sign in as ${username}`);
      onDone();
    } catch {
      setError("No connection. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <Field id={`${id}-u`} label="New username" hint="3 to 24 characters: lowercase letters, numbers or _.">
        <Input
          id={`${id}-u`}
          value={username}
          onChange={(e) => {
            setUsername(normalizeUsernameInput(e.target.value));
            setError(null);
          }}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          aria-describedby={`${id}-u-hint`}
          className={GROUP_FIELD}
        />
      </Field>
      <FormError error={error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          Save username
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const id = useId();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!current) return setError("Type your current password.");
    if (next.length < 8) return setError("The new password needs at least 8 characters.");
    if (next !== again) return setError("The two new passwords are different.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/me", {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null);
        setError(apiErrorMessage(body, "Couldn't change it. Try again."));
        return;
      }
      toast.success("Password changed");
      onDone();
    } catch {
      setError("No connection. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  }

  const clear = () => setError(null);
  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <Field id={`${id}-cur`} label="Current password">
        <Input
          id={`${id}-cur`}
          type="password"
          value={current}
          onChange={(e) => {
            setCurrent(e.target.value);
            clear();
          }}
          autoComplete="current-password"
          autoFocus
          className={GROUP_FIELD}
        />
      </Field>
      <Field id={`${id}-new`} label="New password" hint="At least 8 characters.">
        <Input
          id={`${id}-new`}
          type="password"
          value={next}
          onChange={(e) => {
            setNext(e.target.value);
            clear();
          }}
          autoComplete="new-password"
          aria-describedby={`${id}-new-hint`}
          className={GROUP_FIELD}
        />
      </Field>
      <Field id={`${id}-again`} label="New password again">
        <Input
          id={`${id}-again`}
          type="password"
          value={again}
          onChange={(e) => {
            setAgain(e.target.value);
            clear();
          }}
          autoComplete="new-password"
          className={GROUP_FIELD}
        />
      </Field>
      <FormError error={error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          Change password
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

function RulesGroup({ confirm }: { confirm: (o: ConfirmOptions) => Promise<boolean> }) {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Bumped to show the saved length again after a value that was not a number.
  const [lengthKey, setLengthKey] = useState(0);

  useEffect(() => {
    let live = true;
    setFailed(false);
    void (async () => {
      try {
        const res = await fetch("/api/admin/settings", { cache: "no-store" });
        if (!res.ok) throw new Error("not loaded");
        const body = (await res.json()) as { settings?: Record<string, unknown> };
        if (live) setSettings(body.settings ?? {});
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [attempt]);

  async function save(patch: Record<string, unknown>) {
    if (!settings) return;
    // What these keys were, so a failure puts back only them (not a later change that worked).
    const previous = Object.fromEntries(Object.keys(patch).map((key) => [key, settings[key]]));
    setSettings((current) => (current ? { ...current, ...patch } : current));
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify(patch),
    }).catch(() => null);
    if (!res?.ok) {
      setSettings((current) => (current ? { ...current, ...previous } : current));
      toast.error("Couldn't save. Try again.");
    }
  }

  const title = "Chat rules for everyone";
  const footer = (
    <>
      To change a rule for one person, open them in{" "}
      <Link href="/admin" className={LINK}>
        Members
      </Link>
      .
    </>
  );

  if (failed) {
    return (
      <Group title={title}>
        <GroupButtonRow
          icon={RefreshCw}
          title="Couldn't load the chat rules"
          description="Tap to try again."
          onClick={() => setAttempt((n) => n + 1)}
        />
      </Group>
    );
  }

  if (!settings) {
    return (
      <Group title={title}>
        {CHAT_RULES.map((rule) => (
          <GroupRow
            key={rule.key}
            icon={rule.icon}
            title={rule.title}
            description={<Skeleton className="mt-1 h-3 w-48 bg-muted" />}
          />
        ))}
      </Group>
    );
  }

  const length = everyoneLength(settings);
  return (
    <Group title={title} footer={footer}>
      {CHAT_RULES.map((rule) => (
        <GroupRow
          key={rule.key}
          icon={rule.icon}
          title={rule.title}
          description={rule.description}
          trailing={
            <Switch
              checked={everyoneValue(settings, rule.key)}
              aria-label={rule.title}
              onCheckedChange={async (next) => {
                if (rule.key === "disappearing_messages" && next) {
                  const ok = await confirm({
                    title: DISAPPEARING_CONFIRM.title,
                    confirmLabel: DISAPPEARING_CONFIRM.confirmLabel,
                    destructive: true,
                    body: DISAPPEARING_CONFIRM.paragraphs.map((p) => <p key={p}>{p}</p>),
                  });
                  if (!ok) return;
                }
                void save({ [rule.key]: next });
              }}
            />
          }
        />
      ))}
      <GroupRow
        icon={TextCursorInput}
        title="Longest message"
        description="In characters. The message box stops there."
        trailing={
          <LengthInput
            key={`${length}-${lengthKey}`}
            label="Longest message, in characters"
            defaultValue={String(length)}
            onCommit={(raw) => {
              const n = clampLength(raw);
              if (n !== null && n !== length) void save({ max_message_length: n });
              else setLengthKey((k) => k + 1);
            }}
          />
        }
      />
    </Group>
  );
}
