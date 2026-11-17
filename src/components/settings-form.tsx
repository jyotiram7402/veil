"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Smile } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/chat/user-avatar";
import { MojiPicker } from "@/components/moji-picker";
import { ScreenHeader } from "@/components/layout/screen-header";
import { FIELD, FIELD_LABEL, PANEL, TEXTAREA } from "@/components/form-styles";
import { useSessionStore } from "@/store/session-store";
import { AVATAR_MAX_BYTES, IMAGE_MIME_TYPES } from "@/lib/constants";
import { cn, formatBytes } from "@/lib/utils";
import type { Profile } from "@/types/chat";

export function SettingsScreen({ me }: { me: Profile }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader title="Settings" />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4 sm:px-6">
          <SettingsForm me={me} />
        </div>
      </div>
    </div>
  );
}

export function SettingsForm({ me }: { me: Profile }) {
  const router = useRouter();
  const profile = useSessionStore((s) => s.profile) ?? me;
  const patchProfile = useSessionStore((s) => s.patchProfile);

  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
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
        body: JSON.stringify({ displayName: displayName.trim(), bio: bio.trim() }),
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
    <div className="space-y-4">
      <section
        aria-label="Your avatar"
        className={cn(PANEL, "flex flex-col items-center px-5 pb-6 pt-7 text-center")}
      >
        <UserAvatar
          userId={profile.id}
          username={profile.username}
          displayName={profile.display_name}
          avatarUrl={profile.avatar_url}
          size="2xl"
        />
        <p className="mt-3 max-w-full truncate text-xl font-extrabold tracking-tight">
          {profile.display_name ?? profile.username}
        </p>
        <p className="max-w-full truncate text-sm text-muted-foreground">@{profile.username}</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onAvatarPick(f);
          }}
        />
        <div className="mt-5 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button variant="secondary" className="h-11 px-5 shadow-none" onClick={() => setPickerOpen(true)}>
            <Smile aria-hidden="true" /> Choose an emoji avatar
          </Button>
          <Button
            variant="ghost"
            className="h-11 px-5"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Camera aria-hidden="true" />
            )}{" "}
            Upload a photo
          </Button>
        </div>
      </section>

      <MojiPicker open={pickerOpen} onOpenChange={setPickerOpen} profile={profile} />

      <form
        aria-labelledby="profileTitle"
        className={cn(PANEL, "space-y-4 p-5")}
        onSubmit={(e) => {
          e.preventDefault();
          void onSave();
        }}
      >
        <h2 id="profileTitle" className="text-base font-bold">
          Profile
        </h2>
        <div className="space-y-2">
          <Label htmlFor="displayName" className={FIELD_LABEL}>
            Display name
          </Label>
          <Input
            id="displayName"
            placeholder="Jay"
            maxLength={60}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={FIELD}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bio" className={FIELD_LABEL}>
            Bio
          </Label>
          <Textarea
            id="bio"
            placeholder="A short blurb people see when they tap your profile."
            maxLength={280}
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            aria-describedby="bioCount"
            className={TEXTAREA}
          />
          <p id="bioCount" className="text-right text-xs tabular-nums text-muted-foreground">
            {bio.length}/280
          </p>
        </div>
        <Button type="submit" disabled={saving} className="h-12 w-full px-6 sm:w-auto">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Saving" /> : "Save changes"}
        </Button>
      </form>
    </div>
  );
}
