"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/chat/user-avatar";
import { useSessionStore } from "@/store/session-store";
import { AVATAR_MAX_BYTES, IMAGE_MIME_TYPES } from "@/lib/constants";
import { formatBytes } from "@/lib/utils";
import type { Profile } from "@/types/chat";

export function SettingsForm({ me }: { me: Profile }) {
  const router = useRouter();
  const profile = useSessionStore((s) => s.profile) ?? me;
  const patchProfile = useSessionStore((s) => s.patchProfile);

  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onAvatarPick(file: File) {
    if (!IMAGE_MIME_TYPES.includes(file.type)) {
      toast.error("Pick a PNG, JPEG, WebP, or GIF");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast.error(`Image too large (max ${formatBytes(AVATAR_MAX_BYTES)})`);
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "avatar");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Upload failed");
        return;
      }
      const body = (await res.json()) as { url: string };
      const save = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: body.url }),
      });
      if (!save.ok) {
        toast.error("Saved upload but couldn't update profile");
        return;
      }
      const { profile: next } = (await save.json()) as { profile: Profile };
      patchProfile(next);
      router.refresh();
      toast.success("Avatar updated");
    } finally {
      setUploading(false);
    }
  }

  async function onSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim() || undefined,
          bio: bio.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Couldn't save");
        return;
      }
      const { profile: next } = (await res.json()) as { profile: Profile };
      patchProfile(next);
      router.refresh();
      toast.success("Saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="flex items-center gap-5">
        <div className="relative">
          <UserAvatar
            userId={profile.id}
            username={profile.username}
            displayName={profile.display_name}
            avatarUrl={profile.avatar_url}
            size="xl"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full bg-card border border-border/60 hover:bg-accent transition-colors"
            aria-label="Change avatar"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onAvatarPick(f);
            }}
          />
        </div>
        <div>
          <div className="text-lg font-medium">@{profile.username}</div>
          <p className="text-sm text-muted-foreground">
            Your username can't be changed. Ask an admin if you need a new one.
          </p>
        </div>
      </section>

      <section className="space-y-4 max-w-md">
        <div className="space-y-2">
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            placeholder="Jay"
            maxLength={60}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            placeholder="A short blurb people see when they tap your profile."
            maxLength={280}
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{bio.length}/280</p>
        </div>
        <Button onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
        </Button>
      </section>
    </div>
  );
}
