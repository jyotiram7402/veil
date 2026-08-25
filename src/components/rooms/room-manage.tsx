"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  Check,
  Copy,
  DoorOpen,
  Loader2,
  Lock,
  LockOpen,
  MessageSquare,
  Mic,
  Ticket,
  UserMinus,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useSessionStore } from "@/store/session-store";
import { shareOrCopy } from "@/lib/share";
import { lastSeen } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EXPIRY_OPTIONS, statusBadgeClass } from "@/components/rooms/room-shared";

type Room = {
  id: string;
  name: string | null;
  status: "active" | "ended" | "expired" | "locked";
  created_at: string;
  expires_at: string | null;
  ended_at: string | null;
  max_participants: number | null;
  chat_enabled: boolean;
  voice_enabled: boolean;
  video_enabled: boolean;
};

type Participant = {
  user_id: string;
  blocked: boolean;
  removed_at: string | null;
  can_chat: boolean;
  can_voice: boolean;
  can_video: boolean;
  joined_at: string;
  status: "active" | "blocked" | "removed";
  user: {
    id: string;
    username: string;
    display_name: string | null;
    is_room_guest?: boolean;
  } | null;
};

type InviteView = {
  id: string;
  label: string | null;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  max_uses: number | null;
  use_count: number;
  last_used_at: string | null;
  status: "active" | "revoked" | "expired" | "used";
};

type Detail = { room: Room; participants: Participant[]; invites: InviteView[] };

export function RoomManage({ roomId }: { roomId: string }) {
  const router = useRouter();
  const me = useSessionStore((s) => s.profile);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${roomId}`, { cache: "no-store" });
      if (!res.ok) {
        setError(res.status === 403 ? "You don't manage this room." : "Room not found.");
        return;
      }
      setError(null);
      setDetail((await res.json()) as Detail);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime: reflect joins/leaves/blocks/status changes without polling.
  useEffect(() => {
    if (!me?.id) return;
    const debounced = () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => void load(), 350);
    };
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`admin-room:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_members", filter: `chat_id=eq.${roomId}` },
        debounced,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chats", filter: `id=eq.${roomId}` },
        debounced,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_invites", filter: `room_id=eq.${roomId}` },
        debounced,
      )
      .subscribe();
    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [me?.id, roomId, load]);

  async function patchRoom(patch: Record<string, unknown>, successMsg?: string) {
    const res = await fetch(`/api/rooms/${roomId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(body.error ?? "Couldn't update");
      return;
    }
    if (successMsg) toast.success(successMsg);
    await load();
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="rounded-xl border border-border/60 bg-card/40 p-8 text-center">
        <p className="text-sm text-muted-foreground">{error ?? "Room not found."}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/rooms")}>
          Back to rooms
        </Button>
      </div>
    );
  }

  const { room, participants, invites } = detail;
  const ended = room.status === "ended";
  const active = participants.filter((p) => p.status === "active");
  const blocked = participants.filter((p) => p.status === "blocked");
  const removed = participants.filter((p) => p.status === "removed");

  return (
    <div className="space-y-6">
      <Link
        href="/rooms"
        className="hidden md:inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All rooms
      </Link>

      {/* Room information */}
      <section className="rounded-xl border border-border/60 bg-card/40 p-4 sm:p-5">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg font-semibold">{room.name ?? "Untitled room"}</h2>
          <span
            className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", statusBadgeClass(room.status))}
          >
            {room.status}
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <Info label="Created" value={new Date(room.created_at).toLocaleString()} />
          <Info label="Expires" value={room.expires_at ? new Date(room.expires_at).toLocaleString() : "Never"} />
          <Info label="Participant limit" value={room.max_participants ? String(room.max_participants) : "No limit"} />
          <Info label="In room" value={String(active.length)} />
        </dl>
      </section>

      {/* Room permissions */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Room permissions
        </h3>
        <RoomToggle
          icon={<MessageSquare className="h-4 w-4" />}
          label="Chat"
          checked={room.chat_enabled}
          disabled={ended}
          onChange={(v) => patchRoom({ chatEnabled: v }, "Chat updated")}
        />
        <RoomToggle
          icon={<Mic className="h-4 w-4" />}
          label="Voice"
          hint="Used by future calls"
          checked={room.voice_enabled}
          disabled={ended}
          onChange={(v) => patchRoom({ voiceEnabled: v }, "Voice updated")}
        />
        <RoomToggle
          icon={<Video className="h-4 w-4" />}
          label="Video"
          hint="Used by future calls"
          checked={room.video_enabled}
          disabled={ended}
          onChange={(v) => patchRoom({ videoEnabled: v }, "Video updated")}
        />
      </section>

      {/* Room actions */}
      <section className="flex flex-wrap gap-2">
        {room.status === "active" && (
          <Button variant="outline" size="sm" onClick={() => patchRoom({ status: "locked" }, "Room locked")}>
            <Lock className="h-3.5 w-3.5" /> Lock room
          </Button>
        )}
        {room.status === "locked" && (
          <Button variant="outline" size="sm" onClick={() => patchRoom({ status: "active" }, "Room unlocked")}>
            <LockOpen className="h-3.5 w-3.5" /> Unlock room
          </Button>
        )}
        {!ended && (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={() => {
              if (
                confirm(
                  "End this room?\n\nAll participants will lose access and every invitation will become invalid. This cannot be undone.",
                )
              ) {
                void patchRoom({ status: "ended" }, "Room ended");
              }
            }}
          >
            <DoorOpen className="h-3.5 w-3.5" /> End room
          </Button>
        )}
        {ended && (
          <p className="text-xs text-muted-foreground py-1.5">
            This room has ended. It can no longer be reopened.
          </p>
        )}
      </section>

      {/* Invitations */}
      <InvitesSection roomId={roomId} invites={invites} ended={ended} onChanged={load} />

      {/* Participants */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Participants
        </h3>
        {active.length === 0 && blocked.length === 0 && removed.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nobody has joined yet.</p>
        ) : (
          <div className="space-y-4">
            <ParticipantGroup
              title={`Active (${active.length})`}
              list={active}
              roomId={roomId}
              onChanged={load}
              editable={!ended}
            />
            {blocked.length > 0 && (
              <ParticipantGroup
                title={`Blocked (${blocked.length})`}
                list={blocked}
                roomId={roomId}
                onChanged={load}
                editable={!ended}
              />
            )}
            {removed.length > 0 && (
              <ParticipantGroup
                title={`Removed (${removed.length})`}
                list={removed}
                roomId={roomId}
                onChanged={load}
                editable={false}
              />
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}

function RoomToggle({
  icon,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 bg-card/40 px-3 py-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-muted-foreground">{icon}</span>
        <div className="min-w-0">
          <div className="text-sm">{label}</div>
          {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
        </div>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

function ParticipantGroup({
  title,
  list,
  roomId,
  onChanged,
  editable,
}: {
  title: string;
  list: Participant[];
  roomId: string;
  onChanged: () => void;
  editable: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-medium text-muted-foreground">{title}</div>
      <ul className="space-y-1.5">
        {list.map((p) => (
          <ParticipantRow key={p.user_id} p={p} roomId={roomId} onChanged={onChanged} editable={editable} />
        ))}
      </ul>
    </div>
  );
}

function ParticipantRow({
  p,
  roomId,
  onChanged,
  editable,
}: {
  p: Participant;
  roomId: string;
  onChanged: () => void;
  editable: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function update(patch: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}/participants/${p.user_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Couldn't update participant");
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Remove this participant from the room? They lose access immediately.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}/participants/${p.user_id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Couldn't remove");
        return;
      }
      toast.success("Participant removed");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const name = p.user?.display_name ?? p.user?.username ?? "Guest";

  return (
    <li className={cn("rounded-lg border border-border/60 bg-card/40 p-3", p.status !== "active" && "opacity-70")}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm truncate flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
            {name}
            {p.status !== "active" && (
              <span className={cn("rounded-full px-2 py-0.5 text-[10px]", statusBadgeClass(p.status))}>
                {p.status}
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">joined {lastSeen(p.joined_at)}</div>
        </div>
        {editable && p.status !== "removed" && (
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => update({ blocked: !p.blocked })}
              title={p.blocked ? "Unblock" : "Block"}
              aria-label={p.blocked ? "Unblock participant" : "Block participant"}
            >
              {p.blocked ? <Check className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={busy}
              onClick={remove}
              title="Remove"
              aria-label="Remove participant"
            >
              <UserMinus className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Per-participant permissions */}
      {p.status === "active" && (
        <div className="mt-2.5 flex flex-wrap gap-3 border-t border-border/40 pt-2.5">
          <PermToggle label="Chat" checked={p.can_chat} disabled={!editable || busy} onChange={(v) => update({ canChat: v })} />
          <PermToggle label="Voice" checked={p.can_voice} disabled={!editable || busy} onChange={(v) => update({ canVoice: v })} />
          <PermToggle label="Video" checked={p.can_video} disabled={!editable || busy} onChange={(v) => update({ canVideo: v })} />
        </div>
      )}
    </li>
  );
}

function PermToggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11px]">
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={label} />
      <span className="text-muted-foreground">{label}</span>
    </label>
  );
}

function InvitesSection({
  roomId,
  invites,
  ended,
  onChanged,
}: {
  roomId: string;
  invites: InviteView[];
  ended: boolean;
  onChanged: () => void;
}) {
  const [expiryIdx, setExpiryIdx] = useState(1);
  const [oneTime, setOneTime] = useState(true);
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState<{ url: string } | null>(null);

  async function create() {
    setCreating(true);
    setFresh(null);
    try {
      const res = await fetch(`/api/rooms/${roomId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expiresInMinutes: EXPIRY_OPTIONS[expiryIdx]!.minutes,
          maxUses: oneTime ? 1 : null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Couldn't create invite");
        return;
      }
      const body = (await res.json()) as { invite: { url: string } };
      setFresh({ url: body.invite.url });
      const how = await shareOrCopy(body.invite.url, { title: "Room invitation" });
      toast.success(how === "shared" ? "Invitation created" : "Invitation created — link copied");
      onChanged();
    } finally {
      setCreating(false);
    }
  }

  async function revoke(inviteId: string) {
    const res = await fetch(`/api/rooms/${roomId}/invites/${inviteId}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Couldn't revoke");
    toast.success("Invitation revoked");
    onChanged();
  }

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Invitations
      </h3>

      {!ended && (
        <div className="rounded-xl border border-border/60 bg-card/40 p-3 space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Expires in</Label>
            <div className="flex flex-wrap gap-1.5">
              {EXPIRY_OPTIONS.map((opt, i) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setExpiryIdx(i)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs transition-colors",
                    expiryIdx === i
                      ? "bg-primary text-primary-foreground"
                      : "bg-background/60 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center justify-between">
            <span className="text-xs">One-time use</span>
            <Switch checked={oneTime} onCheckedChange={setOneTime} aria-label="One-time use" />
          </label>
          <Button size="sm" className="w-full" onClick={create} disabled={creating}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <>
                <Ticket className="h-4 w-4" /> Create invitation
              </>
            )}
          </Button>

          {fresh && (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
              <p className="text-[11px] text-muted-foreground">
                Copy this now — the code is shown only once.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={fresh.url}
                  className="h-7 text-xs font-mono bg-background/60"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const how = await shareOrCopy(fresh.url, { title: "Room invitation" });
                    if (how !== "failed") toast.success(how === "shared" ? "Shared" : "Copied");
                    else toast.error("Couldn't copy");
                  }}
                  aria-label="Share or copy invitation link"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {invites.length === 0 ? (
        <p className="text-xs text-muted-foreground">No invitations yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {invites.map((inv) => (
            <li
              key={inv.id}
              className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/40 px-3 py-2"
            >
              <span
                className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0", statusBadgeClass(inv.status))}
              >
                {inv.status}
              </span>
              <div className="min-w-0 flex-1 text-xs text-muted-foreground">
                {inv.max_uses === 1 ? "One-time" : inv.max_uses ? `${inv.max_uses} uses` : "Multi-use"}
                {" · "}used {inv.use_count}
                {inv.max_uses ? `/${inv.max_uses}` : ""}×
                {inv.expires_at && ` · expires ${new Date(inv.expires_at).toLocaleString()}`}
              </div>
              {inv.status === "active" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive shrink-0"
                  onClick={() => revoke(inv.id)}
                >
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
