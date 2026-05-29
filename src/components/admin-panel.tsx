"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Shield, ShieldOff, Trash2, UserPlus } from "lucide-react";
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

type Row = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  last_seen_at: string;
  created_at: string;
};

export function AdminPanel() {
  const me = useSessionStore((s) => s.profile);
  const [users, setUsers] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

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

  async function removeUser(id: string) {
    if (!confirm("Permanently delete this user?")) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(body.error ?? "Couldn't delete");
      return;
    }
    setUsers((u) => u.filter((x) => x.id !== id));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{users.length} members</p>
        <Button onClick={() => setOpen(true)}>
          <UserPlus className="h-4 w-4" /> New member
        </Button>
      </div>

      {loading ? (
        <div className="grid place-items-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ul className="divide-y divide-border/60 rounded-lg border border-border/60 bg-card/40 overflow-hidden">
          {users.map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-4 py-3">
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
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  @{u.username} · joined {new Date(u.created_at).toLocaleDateString()} · last seen {lastSeen(u.last_seen_at)}
                </div>
              </div>
              {u.id !== me?.id && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => removeUser(u.id)}
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <CreateUserDialog open={open} onOpenChange={setOpen} onCreated={reload} />
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
  onCreated: () => void;
}) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
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
    if (!username.trim() || !password) {
      toast.error("Username and password are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          password,
          displayName: displayName.trim() || undefined,
          isAdmin,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Couldn't create");
        return;
      }
      onCreated();
      onOpenChange(false);
      toast.success("Created");
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
            Pick a username and a starter password. Share them privately.
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
          <div className="space-y-2">
            <Label htmlFor="newPassword">Initial password</Label>
            <Input
              id="newPassword"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="at least 8 characters"
              autoComplete="new-password"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
            <div className="flex items-center gap-2">
              {isAdmin ? (
                <Shield className="h-4 w-4 text-primary" />
              ) : (
                <ShieldOff className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-sm">Make admin</span>
            </div>
            <Switch checked={isAdmin} onCheckedChange={setIsAdmin} />
          </div>
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
