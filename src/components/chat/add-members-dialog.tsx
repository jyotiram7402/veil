"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/chat/user-avatar";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/chat";

export function AddMembersDialog({
  open,
  onOpenChange,
  chatId,
  existingIds,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  chatId: string;
  existingIds: string[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setQ("");
      setSelected(new Set());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const c = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const url = new URL("/api/users/search", window.location.origin);
        if (q.trim()) url.searchParams.set("q", q.trim());
        const res = await fetch(url, { signal: c.signal });
        if (!res.ok) return;
        const body = (await res.json()) as { users: Profile[] };
        setUsers(body.users.filter((u) => !existingIds.includes(u.id)));
      } catch {
        // aborted
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      c.abort();
      clearTimeout(t);
    };
  }, [q, open, existingIds]);

  async function save() {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/chats/${chatId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: Array.from(selected) }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Couldn't add");
        return;
      }
      onOpenChange(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <div className="px-6 pt-6">
          <DialogHeader>
            <DialogTitle>Add members</DialogTitle>
            <DialogDescription>Find people by username.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              className="pl-9"
            />
          </div>
        </div>
        <div className="px-3 py-2 max-h-72 overflow-y-auto">
          {loading ? (
            <div className="grid place-items-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              No one to add
            </p>
          ) : (
            <ul className="space-y-0.5">
              {users.map((u) => {
                const isSel = selected.has(u.id);
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected((s) => {
                          const n = new Set(s);
                          if (n.has(u.id)) n.delete(u.id);
                          else n.add(u.id);
                          return n;
                        });
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent/60",
                        isSel && "bg-primary/15 hover:bg-primary/15",
                      )}
                    >
                      <UserAvatar
                        userId={u.id}
                        username={u.username}
                        displayName={u.display_name}
                        avatarUrl={u.avatar_url}
                        size="md"
                        showPresence
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">
                          {u.display_name ?? u.username}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">@{u.username}</div>
                      </div>
                      <div
                        className={cn(
                          "h-5 w-5 rounded-full border-2",
                          isSel ? "border-primary bg-primary" : "border-border/60",
                        )}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="border-t border-border/60 bg-card/40 px-6 py-4 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || selected.size === 0}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : `Add ${selected.size || ""}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
