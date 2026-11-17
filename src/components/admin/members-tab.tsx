"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Copy,
  KeyRound,
  Link as LinkIcon,
  MessageSquare,
  MoreHorizontal,
  Power,
  PowerOff,
  Settings as SettingsIcon,
  Shield,
  Trash2,
  Unlink,
  UserCheck,
  UserPlus,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/chat/user-avatar";
import {
  Chip,
  EmptyState,
  ListSkeleton,
  LoadError,
  dateText,
} from "@/components/admin/parts";
import {
  CreateMemberDialog,
  InviteDialog,
  PersonSettingsDialog,
  type MemberRow,
} from "@/components/admin/member-dialogs";
import { PANEL } from "@/components/form-styles";
import { copyText } from "@/lib/clipboard";
import { lastSeen } from "@/lib/format";
import { useSessionStore } from "@/store/session-store";
import { cn } from "@/lib/utils";

const ITEM = "px-3 py-2.5";

function inviteNote(invite: NonNullable<MemberRow["invite"]>): string {
  const used =
    invite.use_count === 0
      ? "Not used yet"
      : `Used ${invite.use_count} ${invite.use_count === 1 ? "time" : "times"}` +
        (invite.last_used_at ? ` · last ${lastSeen(invite.last_used_at)}` : "");
  return invite.enabled ? used : `Switched off · ${used.charAt(0).toLowerCase()}${used.slice(1)}`;
}

export function MembersTab({ archived }: { archived: boolean }) {
  const router = useRouter();
  const me = useSessionStore((s) => s.profile);
  const [users, setUsers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsFor, setSettingsFor] = useState<MemberRow | null>(null);
  const [rotateFor, setRotateFor] = useState<MemberRow | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users?archived=${archived}`, { cache: "no-store" });
      if (!res.ok) {
        setLoadError("Couldn't load the list. Reload the page to try again.");
        return;
      }
      const body = (await res.json()) as { users: MemberRow[] };
      setLoadError(null);
      setUsers(body.users);
    } catch {
      setLoadError("No connection. Check your internet and reload.");
    } finally {
      setLoading(false);
    }
  }, [archived]);

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

  async function archiveUser(userId: string) {
    if (!confirm("Move to Archive? Their chats stay safe, but they can no longer sign in.")) return;
    const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(body.error ?? "Couldn't archive");
      return;
    }
    setUsers((u) => u.filter((x) => x.id !== userId));
    toast.success("Moved to Archive");
  }

  async function restoreUser(userId: string) {
    if (!confirm("Restore this user? You'll need to issue them a new invite link.")) return;
    const res = await fetch(`/api/admin/users/${userId}/restore`, { method: "POST" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(body.error ?? "Couldn't restore");
      return;
    }
    setUsers((u) => u.filter((x) => x.id !== userId));
    toast.success("Restored");
  }

  async function deleteForever(userId: string) {
    if (
      !confirm(
        "Permanently delete this user and ALL their messages? This cannot be undone.",
      )
    )
      return;
    const res = await fetch(`/api/admin/users/${userId}?hard=1`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(body.error ?? "Couldn't delete");
      return;
    }
    setUsers((u) => u.filter((x) => x.id !== userId));
    toast.success("Deleted permanently");
  }

  async function copyLink(url: string) {
    if (await copyText(url)) toast.success("Link copied");
    else toast.error("Couldn't copy. Select the link and copy it yourself.");
  }

  const suspended = users.filter((u) => u.suspended && !u.archived).length;
  const summary = archived
    ? `${users.length} in the archive`
    : `${users.length} ${users.length === 1 ? "member" : "members"}` +
      (suspended > 0 ? ` · ${suspended} suspended` : "");

  return (
    <div>
      <div className="mb-3 flex min-h-10 items-center justify-between gap-3">
        <p className="px-1 text-sm font-medium text-muted-foreground" aria-live="polite">
          {(loading && users.length === 0) || loadError ? "" : summary}
        </p>
        {!archived && (
          <Button onClick={() => setCreateOpen(true)} className="shrink-0">
            <UserPlus aria-hidden="true" /> New member
          </Button>
        )}
      </div>

      {loading && users.length === 0 ? (
        <ListSkeleton />
      ) : loadError ? (
        <LoadError>{loadError}</LoadError>
      ) : users.length === 0 ? (
        archived ? (
          <EmptyState title="Nothing in the archive">
            People you move to the archive land here. Their chats are kept, and you can restore
            them or delete them for good.
          </EmptyState>
        ) : (
          <EmptyState
            title="No members yet"
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <UserPlus aria-hidden="true" /> New member
              </Button>
            }
          >
            Make an account for someone you want to talk to, or give them a sign-up code.
          </EmptyState>
        )
      ) : (
        <ul className="space-y-2">
          {users.map((u) => {
            const name = u.display_name ?? u.username;
            const isMe = u.id === me?.id;
            const isMember = !archived && !u.is_admin;
            return (
              <li key={u.id} className={cn(PANEL, "p-4")}>
                <div className="flex items-center gap-3">
                  <UserAvatar
                    userId={u.id}
                    username={u.username}
                    displayName={u.display_name}
                    avatarUrl={u.avatar_url}
                    size="lg"
                    showPresence={!archived}
                    className={cn((u.suspended || u.archived) && "opacity-50")}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-h-10 min-w-0 items-center gap-2">
                      <span className="truncate text-[15px] font-bold leading-tight">{name}</span>
                      {u.is_admin && (
                        <Chip tone="brand">
                          <Shield aria-hidden="true" /> Admin
                        </Chip>
                      )}
                      {!isMe && (
                        <div className="ml-auto flex shrink-0 items-center gap-1">
                          {isMember && (
                            <Button
                              size="icon"
                              variant="secondary"
                              onClick={() => openChat(u.id)}
                              aria-label={`Chat with ${name}`}
                              title="Chat"
                              className="shadow-none [&_svg]:size-[18px]"
                            >
                              <MessageSquare />
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`More for ${name}`}
                                className="[&_svg]:size-5"
                              >
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-64">
                              <DropdownMenuLabel className="px-3 py-2">
                                Joined {dateText(u.created_at)}
                              </DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {archived ? (
                                <>
                                  <DropdownMenuItem className={ITEM} onClick={() => restoreUser(u.id)}>
                                    <ArchiveRestore className="h-4 w-4" /> Restore user
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => deleteForever(u.id)}
                                    className={cn(ITEM, "text-destructive")}
                                  >
                                    <Trash2 className="h-4 w-4" /> Delete forever
                                  </DropdownMenuItem>
                                </>
                              ) : (
                                <>
                                  {!u.is_admin && (
                                    <>
                                      <DropdownMenuItem className={ITEM} onClick={() => setSettingsFor(u)}>
                                        <SettingsIcon className="h-4 w-4" /> Settings for this person
                                      </DropdownMenuItem>
                                      <DropdownMenuItem className={ITEM} onClick={() => setRotateFor(u)}>
                                        <KeyRound className="h-4 w-4" /> Change password or link
                                      </DropdownMenuItem>
                                      {u.invite && (
                                        <DropdownMenuItem
                                          className={ITEM}
                                          onClick={() => toggleInvite(u.id, !u.invite!.enabled)}
                                        >
                                          {u.invite.enabled ? (
                                            <>
                                              <PowerOff className="h-4 w-4" /> Switch link off
                                            </>
                                          ) : (
                                            <>
                                              <Power className="h-4 w-4" /> Switch link on
                                            </>
                                          )}
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuItem
                                        className={ITEM}
                                        onClick={() => toggleSuspend(u.id, !u.suspended)}
                                      >
                                        {u.suspended ? (
                                          <>
                                            <UserCheck className="h-4 w-4" /> Reinstate
                                          </>
                                        ) : (
                                          <>
                                            <UserX className="h-4 w-4" /> Suspend
                                          </>
                                        )}
                                      </DropdownMenuItem>
                                      {u.invite && (
                                        <DropdownMenuItem
                                          onClick={() => revokeInvite(u.id)}
                                          className={cn(ITEM, "text-destructive")}
                                        >
                                          <Unlink className="h-4 w-4" /> Revoke link
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuSeparator />
                                    </>
                                  )}
                                  <DropdownMenuItem
                                    onClick={() => archiveUser(u.id)}
                                    className={cn(ITEM, "text-destructive")}
                                  >
                                    <Archive className="h-4 w-4" /> Move to Archive
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>
                    <p className="flex min-w-0 text-[13px] text-muted-foreground">
                      <span className="truncate">@{u.username}</span>
                      <span className="shrink-0 whitespace-pre">
                        {isMe ? " · you" : ` · last seen ${lastSeen(u.last_seen_at)}`}
                      </span>
                    </p>
                    {u.suspended && !u.archived && (
                      <div className="mt-1.5">
                        <Chip tone="warn">Suspended</Chip>
                      </div>
                    )}
                  </div>

                </div>

                {isMember && (
                  <div className="mt-3 border-t border-border/70 pt-3">
                    {u.invite ? (
                      <>
                        <div className="flex items-center gap-2">
                          <div className="relative min-w-0 flex-1">
                            <LinkIcon
                              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <input
                              readOnly
                              value={u.invite.url}
                              aria-label={`Invite link for ${name}`}
                              onFocus={(e) => e.currentTarget.select()}
                              className={cn(
                                "h-10 w-full rounded-full bg-muted pl-10 pr-4 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                !u.invite.enabled && "text-muted-foreground line-through decoration-muted-foreground/60",
                              )}
                            />
                          </div>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => copyLink(u.invite!.url)}
                            className="h-10 shrink-0 px-4 shadow-none"
                          >
                            <Copy aria-hidden="true" /> Copy
                          </Button>
                        </div>
                        <p className="mt-1.5 px-1 text-xs text-muted-foreground">
                          {inviteNote(u.invite)}
                        </p>
                      </>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <p className="px-1 text-[13px] text-muted-foreground">No invite link</p>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setRotateFor(u)}
                          className="h-9 shrink-0 px-3"
                        >
                          <LinkIcon aria-hidden="true" /> Set invite link
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <CreateMemberDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={async (invite) => {
          if (invite?.url) {
            const copied = await copyText(invite.url);
            toast.success(
              copied
                ? "User created — invite link copied"
                : "User created. Use Copy next to their invite link.",
            );
          } else {
            toast.success("Admin created");
          }
          void reload();
        }}
      />

      {rotateFor && (
        <InviteDialog
          user={rotateFor}
          open={!!rotateFor}
          onOpenChange={(v) => !v && setRotateFor(null)}
          onDone={() => {
            setRotateFor(null);
            void reload();
          }}
        />
      )}

      {settingsFor && (
        <PersonSettingsDialog
          user={settingsFor}
          open={!!settingsFor}
          onOpenChange={(v) => !v && setSettingsFor(null)}
        />
      )}
    </div>
  );
}
