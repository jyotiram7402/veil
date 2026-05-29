"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, Pencil, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/chat/user-avatar";
import { AddMembersDialog } from "@/components/chat/add-members-dialog";
import { useChatStore } from "@/store/chat-store";
import { lastSeen } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/chat";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  me: Profile;
  chatId: string;
  chatType: "direct" | "group";
  chatName: string | null;
  chatAvatarUrl: string | null;
  members: Profile[];
};

export function ChatInfoDrawer({
  open,
  onOpenChange,
  me,
  chatId,
  chatType,
  chatName,
  members,
}: Props) {
  const router = useRouter();
  const removeChat = useChatStore((s) => s.removeChat);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(chatName ?? "");
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const isGroup = chatType === "group";
  const isAdmin = isGroup
    ? members.some((m) => m.id === me.id) // simplified — admins are tracked in chat_members; UI shows action and server enforces
    : false;

  async function saveName() {
    if (!name.trim() || name === chatName) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/chats/${chatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Couldn't rename");
        return;
      }
      router.refresh();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function leave() {
    if (!confirm("Leave this chat?")) return;
    const res = await fetch(`/api/chats/${chatId}/members/${me.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(body.error ?? "Couldn't leave");
      return;
    }
    removeChat(chatId);
    onOpenChange(false);
    router.replace("/chats");
    router.refresh();
  }

  async function deleteGroup() {
    if (!confirm("Delete this group for everyone?")) return;
    const res = await fetch(`/api/chats/${chatId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(body.error ?? "Couldn't delete");
      return;
    }
    removeChat(chatId);
    onOpenChange(false);
    router.replace("/chats");
    router.refresh();
  }

  async function removeMember(userId: string) {
    if (userId === me.id) return leave();
    if (!confirm("Remove this member?")) return;
    const res = await fetch(`/api/chats/${chatId}/members/${userId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(body.error ?? "Couldn't remove");
      return;
    }
    router.refresh();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isGroup ? "Group info" : "About this chat"}</DialogTitle>
            <DialogDescription>
              {isGroup ? "Members and group settings." : "The other person in this conversation."}
            </DialogDescription>
          </DialogHeader>

          {isGroup && (
            <div className="-mx-2 flex items-center justify-between rounded-lg bg-background/40 px-3 py-2">
              {editing ? (
                <div className="flex items-center gap-2 flex-1">
                  <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
                  <Button size="sm" onClick={saveName} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                  </Button>
                </div>
              ) : (
                <>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Group name
                    </div>
                    <div className="font-medium">{chatName ?? "Untitled"}</div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => setEditing(true)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {isGroup ? `Members · ${members.length}` : "People"}
              </div>
              {isGroup && (
                <Button size="sm" variant="ghost" onClick={() => setAddOpen(true)}>
                  <UserPlus className="h-4 w-4" /> Add
                </Button>
              )}
            </div>
            <ul className="space-y-0.5 max-h-72 overflow-y-auto -mx-2">
              {members.map((m) => (
                <li
                  key={m.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/50",
                  )}
                >
                  <UserAvatar
                    userId={m.id}
                    username={m.username}
                    displayName={m.display_name}
                    avatarUrl={m.avatar_url}
                    size="md"
                    showPresence
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {m.display_name ?? m.username}
                      {m.id === me.id && (
                        <span className="ml-1 text-xs text-muted-foreground">(you)</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      @{m.username} · last seen {lastSeen(m.last_seen_at)}
                    </div>
                  </div>
                  {isGroup && isAdmin && m.id !== me.id && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeMember(m.id)}
                      aria-label="Remove"
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {isGroup && (
            <div className="flex flex-col gap-2 pt-1">
              <Button variant="outline" onClick={leave}>
                <LogOut className="h-4 w-4" /> Leave group
              </Button>
              {isAdmin && (
                <Button variant="destructive" onClick={deleteGroup}>
                  <Trash2 className="h-4 w-4" /> Delete group
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AddMembersDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        chatId={chatId}
        existingIds={members.map((m) => m.id)}
      />
    </>
  );
}
