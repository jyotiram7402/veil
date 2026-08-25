"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DoorOpen,
  Loader2,
  MessageSquare,
  Mic,
  Plus,
  Radio,
  Ticket,
  Users,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useSessionStore } from "@/store/session-store";
import { cn } from "@/lib/utils";
import { EXPIRY_OPTIONS, statusBadgeClass } from "@/components/rooms/room-shared";

type RoomRow = {
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
  participant_count: number;
  active_invite_count: number;
  expiring_invite_count: number;
};

export function RoomsAdmin() {
  const router = useRouter();
  const me = useSessionStore((s) => s.profile);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/rooms", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { rooms: RoomRow[] };
      setRooms(body.rooms);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Realtime: refresh the dashboard when rooms / participants / invites change.
  useEffect(() => {
    if (!me?.id) return;
    const debouncedReload = () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => void reload(), 400);
    };
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`admin-rooms:${me.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chats" }, debouncedReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_members" }, debouncedReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_invites" }, debouncedReload)
      .subscribe();
    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [me?.id, reload]);

  const overview = {
    total: rooms.length,
    active: rooms.filter((r) => r.status === "active").length,
    locked: rooms.filter((r) => r.status === "locked").length,
    endedRecently: rooms.filter((r) => r.status === "ended").length,
    participants: rooms.reduce((n, r) => n + r.participant_count, 0),
    invites: rooms.reduce((n, r) => n + r.active_invite_count, 0),
    expiring: rooms.reduce((n, r) => n + r.expiring_invite_count, 0),
  };

  return (
    <div>
      {/* Overview */}
      <section className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Active rooms" value={overview.active} />
        <Stat label="Participants" value={overview.participants} />
        <Stat label="Active invites" value={overview.invites} />
        <Stat label="Expiring soon" value={overview.expiring} highlight={overview.expiring > 0} />
        <Stat label="Locked" value={overview.locked} />
        <Stat label="Ended" value={overview.endedRecently} />
        <Stat label="Total rooms" value={overview.total} />
        <div className="flex items-center justify-center rounded-xl border border-border/60 bg-card/40 p-3">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Radio className="h-3 w-3 text-emerald-500" /> live
          </span>
        </div>
      </section>

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {rooms.length} {rooms.length === 1 ? "room" : "rooms"}
        </p>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New room
        </Button>
      </div>

      {loading ? (
        <div className="grid place-items-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rooms.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-card/40 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No rooms yet. Create one to start inviting people.
          </p>
        </div>
      ) : (
        <ul className="space-y-2 sm:grid sm:grid-cols-2 sm:gap-2 sm:space-y-0 xl:grid-cols-3">
          {rooms.map((r) => (
            <li key={r.id}>
              <div className="rounded-xl border border-border/60 bg-card/40 p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/15 text-primary shrink-0">
                    <Users className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">
                        {r.name ?? "Untitled room"}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium",
                          statusBadgeClass(r.status),
                        )}
                      >
                        {r.status}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {r.participant_count} in room · {r.active_invite_count} active invite
                      {r.active_invite_count === 1 ? "" : "s"}
                      {r.expires_at && ` · expires ${new Date(r.expires_at).toLocaleDateString()}`}
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                      <FeatureTick icon={<MessageSquare className="h-3 w-3" />} label="Chat" on={r.chat_enabled} />
                      <FeatureTick icon={<Mic className="h-3 w-3" />} label="Voice" on={r.voice_enabled} />
                      <FeatureTick icon={<Video className="h-3 w-3" />} label="Video" on={r.video_enabled} />
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => router.push(`/rooms/${r.id}`)}>
                    <DoorOpen className="h-3.5 w-3.5" /> Manage
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => router.push(`/rooms/${r.id}?tab=invites`)}
                  >
                    <Ticket className="h-3.5 w-3.5" /> Invite
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CreateRoomDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(roomId) => {
          setCreateOpen(false);
          void reload();
          if (roomId) router.push(`/rooms/${roomId}?tab=invites`);
        }}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
      <div className={cn("text-xl font-semibold", highlight && "text-amber-500")}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function FeatureTick({
  icon,
  label,
  on,
}: {
  icon: React.ReactNode;
  label: string;
  on: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1", on ? "text-foreground" : "opacity-40 line-through")}>
      {icon}
      {label}
    </span>
  );
}

function CreateRoomDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (roomId?: string) => void;
}) {
  const [name, setName] = useState("");
  const [chatEnabled, setChatEnabled] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [maxParticipants, setMaxParticipants] = useState("10");
  const [expiryIdx, setExpiryIdx] = useState(2); // 24h default
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setChatEnabled(true);
      setVoiceEnabled(true);
      setVideoEnabled(true);
      setMaxParticipants("10");
      setExpiryIdx(2);
    }
  }, [open]);

  async function submit() {
    if (!name.trim()) return toast.error("Give the room a name");
    setSaving(true);
    try {
      const max = parseInt(maxParticipants, 10);
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          chatEnabled,
          voiceEnabled,
          videoEnabled,
          maxParticipants: Number.isFinite(max) && max >= 2 ? max : undefined,
          expiresInMinutes: EXPIRY_OPTIONS[expiryIdx]!.minutes ?? undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Couldn't create room");
        return;
      }
      const body = (await res.json()) as { roomId?: string };
      toast.success("Room created");
      onCreated(body.roomId);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New room</DialogTitle>
          <DialogDescription>Secure room with admin-controlled access.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="roomName">Room name</Label>
            <Input
              id="roomName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Team Discussion"
              maxLength={80}
              autoFocus
            />
          </div>

          <FeatureToggle label="Chat" checked={chatEnabled} onChange={setChatEnabled} />
          <FeatureToggle label="Voice (used by future calls)" checked={voiceEnabled} onChange={setVoiceEnabled} />
          <FeatureToggle label="Video (used by future calls)" checked={videoEnabled} onChange={setVideoEnabled} />

          <div className="space-y-2">
            <Label htmlFor="maxP">Max participants</Label>
            <Input
              id="maxP"
              type="number"
              min={2}
              max={500}
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(e.target.value)}
              placeholder="No limit"
            />
          </div>

          <div className="space-y-2">
            <Label>Room expires in</Label>
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

function FeatureToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}
