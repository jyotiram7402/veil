"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  Link as LinkIcon,
  Loader2,
  MessageSquare,
  Plus,
  Power,
  PowerOff,
  RefreshCcw,
  Shield,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { UserAvatar } from "@/components/chat/user-avatar";
import { lastSeen } from "@/lib/format";
import { useSessionStore } from "@/store/session-store";
import { cn } from "@/lib/utils";

type Invite = {
  url: string;
  enabled: boolean;
  use_count: number;
  last_used_at: string | null;
};

type Row = {
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

type Tab = "users" | "settings";

export function AdminPanel() {
  const [tab, setTab] = useState<Tab>("users");

  return (
    <div>
      <div className="rounded-lg border border-border/60 bg-background/40 p-1 inline-flex mb-6">
        <TabButton active={tab === "users"} onClick={() => setTab("users")}>
          Users
        </TabButton>
        <TabButton active={tab === "settings"} onClick={() => setTab("settings")}>
          Settings
        </TabButton>
      </div>

      {tab === "users" ? <UsersTab /> : <SettingsTab />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-1.5 text-sm rounded-md transition-colors",
        active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function UsersTab() {
  const router = useRouter();
  const me = useSessionStore((s) => s.profile);
  const [users, setUsers] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { users: Row[] };
      setUsers(body.users);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function openChat(userId: string) {
    const res = await fetch(`/api/admin/users/${userId}/chat`, { method: "POST" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(body.error ?? "Couldn't open chat");
      return;
    }
    const body = (await res.json()) as { chatId: string };
    router.push(`/chats/${body.chatId}`);
  }

  async function toggleInvite(userId: string, enabled: boolean) {
    const res = await fetch(`/api/admin/users/${userId}/invite`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) {
      toast.error("Couldn't update link");
      return;
    }
    await reload();
  }

  async function rotateInvite(userId: string) {
    if (!confirm("Replace this user's link? Their old link will stop working immediately.")) return;
    const res = await fetch(`/api/admin/users/${userId}/invite`, { method: "POST" });
    if (!res.ok) {
      toast.error("Couldn't rotate link");
      return;
    }
    await reload();
    toast.success("New link generated");
  }

  async function revokeInvite(userId: string) {
    if (!confirm("Revoke this link permanently? The user won't be able to sign in.")) return;
    const res = await fetch(`/api/admin/users/${userId}/invite`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Couldn't revoke");
      return;
    }
    await reload();
  }

  async function toggleSuspend(userId: string, suspended: boolean) {
    const res = await fetch(`/api/admin/users/${userId}/suspend`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suspended }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(body.error ?? "Couldn't update");
      return;
    }
    await reload();
  }

  async function deleteUser(userId: string) {
    if (!confirm("Delete this user permanently? Their chat history stays in your archive.")) return;
    const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(body.error ?? "Couldn't delete");
      return;
    }
    setUsers((u) => u.filter((x) => x.id !== userId));
  }

  function copyLink(url: string) {
    navigator.clipboard.writeText(url).then(
      () => toast.success("Link copied"),
      () => toast.error("Copy failed"),
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{users.length} members</p>
        <Button onClick={() => setCreateOpen(true)}>
          <UserPlus className="h-4 w-4" /> New member
        </Button>
      </div>

      {loading ? (
        <div className="grid place-items-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ul className="space-y-2">
          {users.map((u) => (
            <li
              key={u.id}
              className={cn(
                "rounded-xl border border-border/60 bg-card/40 p-4",
                (u.suspended || u.archived) && "opacity-60",
              )}
            >
              <div className="flex items-start gap-3">
                <UserAvatar
                  userId={u.id}
                  username={u.username}
                  displayName={u.display_name}
                  avatarUrl={u.avatar_url}
                  size="md"
                  showPresence
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {u.display_name ?? u.username}
                    </span>
                    {u.is_admin && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] font-medium">
                        <Shield className="h-3 w-3" /> admin
                      </span>
                    )}
                    {u.suspended && (
                      <span className="rounded-full bg-amber-500/15 text-amber-400 px-2 py-0.5 text-[10px] font-medium">
                        suspended
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    @{u.username} · joined {new Date(u.created_at).toLocaleDateString()} · last seen {lastSeen(u.last_seen_at)}
                  </div>

                  {/* Invite link row */}
                  {!u.is_admin && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {u.invite ? (
                        <>
                          <div className="flex items-center gap-2 flex-1 min-w-[12rem]">
                            <LinkIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <Input
                              readOnly
                              value={u.invite.url}
                              className="h-7 text-xs font-mono bg-background/60"
                              onFocus={(e) => e.currentTarget.select()}
                            />
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => copyLink(u.invite!.url)}>
                            <Copy className="h-3.5 w-3.5" /> Copy
                          </Button>
                          <span className="text-[10px] text-muted-foreground">
                            used {u.invite.use_count}×
                            {u.invite.last_used_at &&
                              ` · ${lastSeen(u.invite.last_used_at)}`}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleInvite(u.id, !u.invite!.enabled)}
                            title={u.invite.enabled ? "Disable link" : "Enable link"}
                          >
                            {u.invite.enabled ? (
                              <PowerOff className="h-3.5 w-3.5" />
                            ) : (
                              <Power className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => rotateInvite(u.id)}
                            title="Rotate link"
                          >
                            <RefreshCcw className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => revokeInvite(u.id)}
                            title="Revoke permanently"
                            className="text-destructive"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => rotateInvite(u.id)}>
                          <LinkIcon className="h-3.5 w-3.5" /> Generate invite link
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Right-side actions */}
                {u.id !== me?.id && (
                  <div className="flex flex-col gap-1">
                    {!u.is_admin && (
                      <Button size="sm" variant="outline" onClick={() => openChat(u.id)}>
                        <MessageSquare className="h-3.5 w-3.5" /> Chat
                      </Button>
                    )}
                    {!u.is_admin && (
                      <div className="flex items-center justify-between gap-2 text-xs px-1">
                        <span className="text-muted-foreground">Active</span>
                        <Switch
                          checked={!u.suspended}
                          onCheckedChange={(v) => toggleSuspend(u.id, !v)}
                        />
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => deleteUser(u.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(invite) => {
          if (invite?.url) {
            navigator.clipboard.writeText(invite.url).catch(() => undefined);
            toast.success("User created — invite link copied");
          } else {
            toast.success("Admin created");
          }
          void reload();
        }}
      />
    </div>
  );
}

function CreateUserDialog({
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
    if (!username.trim()) {
      toast.error("Username is required");
      return;
    }
    if (isAdmin && password.length < 8) {
      toast.error("Admin password must be at least 8 characters");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          displayName: displayName.trim() || undefined,
          isAdmin,
          password: isAdmin ? password : undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Couldn't create");
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New member</DialogTitle>
          <DialogDescription>
            {isAdmin
              ? "Admin accounts sign in with a username and password."
              : "Regular users sign in with their invite link only. We'll generate it on save."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="newUsername">Username</Label>
            <Input
              id="newUsername"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="lowercase, numbers, _"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newDisplayName">Display name (optional)</Label>
            <Input
              id="newDisplayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Jay K."
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
            <div className="flex items-center gap-2">
              <Shield className={cn("h-4 w-4", isAdmin ? "text-primary" : "text-muted-foreground")} />
              <span className="text-sm">Make admin</span>
            </div>
            <Switch checked={isAdmin} onCheckedChange={setIsAdmin} />
          </div>
          {isAdmin && (
            <div className="space-y-2">
              <Label htmlFor="newPassword">Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="at least 8 characters"
                autoComplete="new-password"
              />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <>
                <Plus className="h-4 w-4" /> Create
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsTab() {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/settings", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { settings: Record<string, unknown> };
        setSettings(body.settings);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    try {
      const merged = { ...settings, ...patch };
      setSettings(merged);
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        toast.error("Couldn't save");
        return;
      }
      toast.success("Saved");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ToggleRow
        title="Allow file uploads"
        description="Whether users can attach images and files to messages."
        value={Boolean(settings.uploads_enabled)}
        onChange={(v) => save({ uploads_enabled: v })}
        disabled={saving}
      />
      <ToggleRow
        title="Show typing indicators"
        description='The "… is typing" bubble while someone composes.'
        value={Boolean(settings.typing_indicator)}
        onChange={(v) => save({ typing_indicator: v })}
        disabled={saving}
      />
      <ToggleRow
        title="Screen guard (anti-leak overlay)"
        description="Best-effort blur + watermark in user chat. Cannot prevent screenshots completely."
        value={Boolean(settings.screen_guard)}
        onChange={(v) => save({ screen_guard: v })}
        disabled={saving}
      />
      <ToggleRow
        title="Ephemeral user sessions"
        description="End user session when their tab is hidden. They must re-open the invite link to return."
        value={Boolean(settings.user_session_ephemeral)}
        onChange={(v) => save({ user_session_ephemeral: v })}
        disabled={saving}
      />

      <div className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-2">
        <div>
          <div className="text-sm font-medium">Max message length</div>
          <p className="text-xs text-muted-foreground">
            Characters. The composer enforces this on the client too.
          </p>
        </div>
        <Input
          type="number"
          value={String(settings.max_message_length ?? 4000)}
          min={100}
          max={20000}
          onChange={(e) =>
            setSettings((s) => ({ ...s, max_message_length: parseInt(e.target.value, 10) || 4000 }))
          }
          onBlur={() => save({ max_message_length: settings.max_message_length })}
          className="max-w-[8rem]"
        />
      </div>
    </div>
  );
}

function ToggleRow({
  title,
  description,
  value,
  onChange,
  disabled,
}: {
  title: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-card/40 p-4">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Switch checked={value} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
