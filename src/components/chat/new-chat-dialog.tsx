"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, Users } from "lucide-react";
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

type Mode = "direct" | "group";

export function NewChatDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("direct");
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setSelected(new Set());
    setGroupName("");
    setMode("direct");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const url = new URL("/api/users/search", window.location.origin);
        if (q.trim()) url.searchParams.set("q", q.trim());
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return;
        const body = (await res.json()) as { users: Profile[] };
        setUsers(body.users);
      } catch {
        // aborted
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [q, open]);

  const toggle = useCallback((id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const startDirect = useCallback(
    async (otherUserId: string) => {
      setCreating(true);
      try {
        const res = await fetch("/api/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "direct", otherUserId }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(body.error ?? "Couldn't open chat");
          return;
        }
        const body = (await res.json()) as { chatId: string };
        onOpenChange(false);
        router.push(`/chats/${body.chatId}`);
        router.refresh();
      } finally {
        setCreating(false);
      }
    },
    [router, onOpenChange],
  );

  const createGroup = useCallback(async () => {
    if (!groupName.trim()) {
      toast.error("Give your group a name");
      return;
    }
    if (selected.size === 0) {
      toast.error("Add at least one member");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "group",
          name: groupName.trim(),
          memberIds: Array.from(selected),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Couldn't create group");
        return;
      }
      const body = (await res.json()) as { chatId: string };
      onOpenChange(false);
      router.push(`/chats/${body.chatId}`);
      router.refresh();
    } finally {
      setCreating(false);
    }
  }, [groupName, selected, router, onOpenChange]);

  const tabBtn = useCallback(
    (m: Mode, label: string) => (
      <button
        type="button"
        onClick={() => setMode(m)}
        className={cn(
          "flex-1 px-3 py-1.5 text-sm rounded-md transition-colors",
          mode === m
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {label}
      </button>
    ),
    [mode],
  );

  const filtered = useMemo(() => users, [users]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <div className="px-6 pt-6">
          <DialogHeader>
            <DialogTitle>Start a conversation</DialogTitle>
            <DialogDescription>
              Pick a person, or gather a few of them into a group.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 rounded-lg border border-border/60 bg-background/40 p-1 flex">
            {tabBtn("direct", "Direct")}
            {tabBtn("group", "Group")}
          </div>

          {mode === "group" && (
            <div className="mt-3">
              <Input
                placeholder="Group name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                maxLength={60}
              />
            </div>
          )}

          <div className="mt-3 relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by username"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="px-3 py-2 max-h-72 overflow-y-auto">
          {loading ? (
            <div className="grid place-items-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              No people found
            </p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((u) => {
                const isSelected = selected.has(u.id);
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => (mode === "direct" ? startDirect(u.id) : toggle(u.id))}
                      disabled={creating}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                        "hover:bg-accent/60",
                        isSelected && mode === "group" && "bg-primary/15 hover:bg-primary/15",
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
                        <div className="text-xs text-muted-foreground truncate">
                          @{u.username}
                        </div>
                      </div>
                      {mode === "group" && (
                        <div
                          className={cn(
                            "h-5 w-5 rounded-full border-2",
                            isSelected
                              ? "border-primary bg-primary"
                              : "border-border/60",
                          )}
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {mode === "group" && (
          <div className="border-t border-border/60 bg-card/40 px-6 py-4 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              <Users className="inline h-3.5 w-3.5 mr-1" />
              {selected.size} selected
            </div>
            <Button onClick={createGroup} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
