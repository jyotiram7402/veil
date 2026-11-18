"use client";

import { useEffect, useState } from "react";
import { Loader2, RotateCcw, Shield } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DISAPPEARING_WARNING, SheetDialog, ToggleRow } from "@/components/admin/parts";
import { FIELD, FIELD_LABEL } from "@/components/form-styles";
import { copyText } from "@/lib/clipboard";
import { apiErrorMessage, cn, normalizeUsernameInput } from "@/lib/utils";

export type Invite = {
  url: string;
  enabled: boolean;
  use_count: number;
  last_used_at: string | null;
  has_password: boolean;
};

export type MemberRow = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  suspended: boolean;
  archived: boolean;
  last_seen_at: string;
  created_at: string;
  invite: Invite | null;
};

function DialogButtons({
  onCancel,
  busy,
  children,
}: {
  onCancel: () => void;
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="h-12 flex-1 shadow-none"
        onClick={onCancel}
        disabled={busy}
      >
        Cancel
      </Button>
      <Button type="submit" className="h-12 flex-1 [&_svg]:size-5" disabled={busy}>
        {busy ? <Loader2 className="animate-spin" aria-label="Saving" /> : children}
      </Button>
    </>
  );
}

export function CreateMemberDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (invite: { url: string } | null) => void;
}) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setUsername("");
      setDisplayName("");
      setPassword("");
      setIsAdmin(false);
    }
  }, [open]);

  async function submit() {
    const u = normalizeUsernameInput(username);
    if (!u) return toast.error("Username is required");
    if (u.length < 3) {
      return toast.error("Username needs at least 3 characters (e.g. rk1 or rahul)");
    }
    if (!password || password.length < 4) {
      return toast.error("Password must be at least 4 characters");
    }
    if (isAdmin && password.length < 8) {
      return toast.error("Admin passwords need at least 8 characters");
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: u,
          displayName: displayName.trim() || undefined,
          isAdmin,
          password,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(apiErrorMessage(body, "Couldn't create"));
        return;
      }
      const body = (await res.json()) as { invite: { url: string } | null };
      onOpenChange(false);
      onCreated(body.invite ?? null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SheetDialog
      open={open}
      onOpenChange={onOpenChange}
      title="New member"
      description={
        isAdmin
          ? "Admin signs in at /login with the password below."
          : "Pick a password — the user will need it after opening their invite link."
      }
      onSubmit={submit}
      footer={
        <DialogButtons onCancel={() => onOpenChange(false)} busy={saving}>
          Create
        </DialogButtons>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="newUsername" className={FIELD_LABEL}>
            Username
          </Label>
          <Input
            id="newUsername"
            value={username}
            onChange={(e) => setUsername(normalizeUsernameInput(e.target.value))}
            placeholder="e.g. rahul"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-describedby="newUsernameHint"
            className={FIELD}
          />
          <p id="newUsernameHint" className="text-xs text-muted-foreground">
            3–24 characters: lowercase letters, numbers, or _.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="newDisplayName" className={FIELD_LABEL}>
            Display name (optional)
          </Label>
          <Input
            id="newDisplayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Jay K."
            className={FIELD}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="newPassword" className={FIELD_LABEL}>
            Password
          </Label>
          <Input
            id="newPassword"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isAdmin ? "at least 8 characters" : "at least 4 characters"}
            autoComplete="new-password"
            className={FIELD}
          />
        </div>
        <label
          htmlFor="newIsAdmin"
          className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border/70 px-4 py-3"
        >
          <Shield
            className={cn("h-5 w-5 shrink-0", isAdmin ? "text-primary-ink" : "text-muted-foreground")}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 text-[15px] font-semibold">Make admin</span>
          <Switch id="newIsAdmin" checked={isAdmin} onCheckedChange={setIsAdmin} />
        </label>
      </div>
    </SheetDialog>
  );
}

export function InviteDialog({
  user,
  open,
  onOpenChange,
  onDone,
}: {
  user: MemberRow;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"new-link" | "password-only">("new-link");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!password || password.length < 4) {
      return toast.error("Password must be at least 4 characters");
    }
    setSaving(true);
    try {
      const url = `/api/admin/users/${user.id}/invite`;
      const res = await fetch(url, {
        method: mode === "new-link" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Couldn't update");
        return;
      }
      if (mode === "new-link") {
        const body = (await res.json()) as { invite: { url: string } };
        const copied = await copyText(body.invite.url);
        toast.success(
          copied
            ? "New link copied — send it to the user"
            : "New link created. Use Copy next to it.",
        );
      } else {
        toast.success("Password updated");
      }
      onDone();
    } finally {
      setSaving(false);
    }
  }

  const modes = [
    { id: "password-only" as const, label: "Password only" },
    { id: "new-link" as const, label: "New link" },
  ];

  return (
    <SheetDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Change password"
      description={
        <>
          for <strong className="font-semibold text-foreground">@{user.username}</strong>
        </>
      }
      onSubmit={submit}
      footer={
        <DialogButtons onCancel={() => onOpenChange(false)} busy={saving}>
          Save
        </DialogButtons>
      }
    >
      <div className="space-y-4">
        <div
          role="radiogroup"
          aria-label="What to change"
          className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1"
        >
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => setMode(m.id)}
              className={cn(
                "h-10 whitespace-nowrap rounded-full px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                mode === m.id
                  ? "bg-card text-foreground shadow-[0_1px_3px_rgb(15_18_30/0.12)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <Label htmlFor="rotatePassword" className={FIELD_LABEL}>
            {mode === "new-link" ? "New password" : "Password"}
          </Label>
          <Input
            id="rotatePassword"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="at least 4 characters"
            autoComplete="new-password"
            aria-describedby="rotateHint"
            className={FIELD}
          />
          <p id="rotateHint" className="text-[13px] leading-snug text-muted-foreground">
            {mode === "new-link"
              ? "Issues a fresh URL and password. The old URL stops working immediately."
              : "Keeps the same URL but changes the password the user types after opening it."}
          </p>
        </div>
      </div>
    </SheetDialog>
  );
}

const PERSON_TOGGLES = [
  { key: "uploads_enabled", label: "Allow file uploads" },
  { key: "typing_indicator", label: "Show typing indicators" },
  { key: "screen_guard", label: "Lock screen on blur" },
  { key: "disappearing_messages", label: "Disappearing messages" },
];

function ResetButton({ onClick, what }: { onClick: () => void; what: string }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={onClick}
      aria-label={`Reset ${what} to the default`}
      title="Clear override, inherit default"
      className="h-7 shrink-0 gap-1 px-2 text-xs text-primary-ink hover:bg-accent hover:text-accent-foreground dark:text-foreground [&_svg]:size-3.5"
    >
      <RotateCcw aria-hidden="true" /> Reset
    </Button>
  );
}

export function PersonSettingsDialog({
  user,
  open,
  onOpenChange,
}: {
  user: MemberRow;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [globalSettings, setGlobalSettings] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const [perUser, global] = await Promise.all([
        fetch(`/api/admin/users/${user.id}/settings`, { cache: "no-store" }).then((r) =>
          r.ok ? r.json() : { settings: {} },
        ),
        fetch("/api/admin/settings", { cache: "no-store" }).then((r) =>
          r.ok ? r.json() : { settings: {} },
        ),
      ]);
      setSettings(perUser.settings ?? {});
      setGlobalSettings(global.settings ?? {});
    })();
  }, [open, user.id]);

  async function save(patch: Record<string, unknown>) {
    if (!settings) return;
    const optimistic = { ...settings, ...patch };
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete optimistic[k];
    }
    setSettings(optimistic);
    const res = await fetch(`/api/admin/users/${user.id}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) toast.error("Couldn't save");
  }

  const lengthOverride = settings !== null && "max_message_length" in settings;

  return (
    <SheetDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Settings for @${user.username}`}
      description="Only for this person. Reset brings back the default everyone has."
    >
      {!settings ? (
        <div className="grid place-items-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/70">
            {PERSON_TOGGLES.map((row) => {
              const hasOverride = row.key in settings;
              const effective = hasOverride
                ? Boolean(settings[row.key])
                : Boolean(globalSettings[row.key]);
              return (
                <ToggleRow
                  key={row.key}
                  title={row.label}
                  note={
                    hasOverride
                      ? `Set for this person: ${effective ? "on" : "off"} ·`
                      : `Same as everyone (${effective ? "on" : "off"})`
                  }
                  value={effective}
                  onChange={(v) => {
                    if (row.key === "disappearing_messages" && v && !confirm(DISAPPEARING_WARNING)) {
                      return;
                    }
                    void save({ [row.key]: v });
                  }}
                  after={
                    hasOverride ? (
                      <ResetButton
                        what={row.label.toLowerCase()}
                        onClick={() => void save({ [row.key]: null })}
                      />
                    ) : null
                  }
                />
              );
            })}
          </div>
          <div className="rounded-2xl border border-border/70 px-4 py-3.5">
            <Label htmlFor="personMaxLength" className="block text-[15px] font-semibold">
              Max message length
            </Label>
            <div className="mt-0.5 flex min-h-7 flex-wrap items-center gap-x-1">
              <span className="text-xs font-medium text-muted-foreground">
                {lengthOverride
                  ? `Set for this person: ${settings.max_message_length} ·`
                  : `Same as everyone (${globalSettings.max_message_length ?? 4000})`}
              </span>
              {lengthOverride && (
                <ResetButton
                  what="max message length"
                  onClick={() => void save({ max_message_length: null })}
                />
              )}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Input
                id="personMaxLength"
                type="number"
                inputMode="numeric"
                min={100}
                max={20000}
                defaultValue={String(
                  settings.max_message_length ?? globalSettings.max_message_length ?? 4000,
                )}
                onBlur={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (Number.isFinite(n)) void save({ max_message_length: n });
                }}
                className={cn(FIELD, "w-32 tabular-nums")}
              />
              <span className="text-sm text-muted-foreground">characters</span>
            </div>
          </div>
        </div>
      )}
    </SheetDialog>
  );
}
