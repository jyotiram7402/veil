"use client";

import { useEffect, useMemo, useState } from "react";
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
import { UserAvatar } from "@/components/chat/user-avatar";
import type { Profile } from "@/types/chat";

export function NewChatDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (!open) setQ("");
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
        // Hide other admins from the picker — admins talk to users only.
        setUsers(body.users.filter((u) => !u.is_admin));
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

  async function openWith(userId: string) {
    setOpening(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/chat`, { method: "POST" });
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
      setOpening(false);
    }
  }

  const filtered = useMemo(() => users, [users]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <div className="px-6 pt-6">
          <DialogHeader>
            <DialogTitle>Open a conversation</DialogTitle>
            <DialogDescription>
              Pick a member to talk to. Each user has exactly one chat with you.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 relative">
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
              No members yet. Create one from the Members page.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => openWith(u.id)}
                    disabled={opening}
                    className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent/60"
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
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
