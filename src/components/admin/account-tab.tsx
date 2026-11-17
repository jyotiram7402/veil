"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListSkeleton } from "@/components/admin/parts";
import { FIELD, FIELD_LABEL, PANEL } from "@/components/form-styles";
import { useSessionStore } from "@/store/session-store";
import { apiErrorMessage, cn, normalizeUsernameInput } from "@/lib/utils";

function Section({
  id,
  title,
  onSubmit,
  children,
}: {
  id: string;
  title: string;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={cn(PANEL, "p-5")}>
      <h2 id={id} className="text-base font-bold">
        {title}
      </h2>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {children}
      </form>
    </section>
  );
}

export function AccountTab() {
  const me = useSessionStore((s) => s.profile);
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (me) {
      setUsername(me.username);
      setDisplayName(me.display_name ?? "");
    }
  }, [me]);

  if (!me) return <ListSkeleton rows={2} />;

  async function saveProfile() {
    const patch: Record<string, unknown> = {};
    if (username && username !== me!.username) patch.username = username.trim().toLowerCase();
    if (displayName !== (me!.display_name ?? "")) patch.displayName = displayName.trim() || null;
    if (Object.keys(patch).length === 0) {
      toast.info("Nothing to save");
      return;
    }
    setSavingProfile(true);
    try {
      const res = await fetch("/api/admin/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(apiErrorMessage(body, "Couldn't save"));
        return;
      }
      toast.success("Profile updated");
      router.refresh();
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword() {
    if (!currentPassword) return toast.error("Enter your current password");
    if (newPassword.length < 8) return toast.error("New password must be at least 8 characters");
    if (newPassword !== confirmPassword) return toast.error("Passwords don't match");

    setSavingPassword(true);
    try {
      const res = await fetch("/api/admin/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(apiErrorMessage(body, "Couldn't change password"));
        return;
      }
      toast.success("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="space-y-4">
      <Section id="acctProfileTitle" title="Profile" onSubmit={saveProfile}>
        <div className="space-y-2">
          <Label htmlFor="acctUsername" className={FIELD_LABEL}>
            Username
          </Label>
          <Input
            id="acctUsername"
            value={username}
            onChange={(e) => setUsername(normalizeUsernameInput(e.target.value))}
            placeholder="lowercase, numbers, _"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-describedby="acctUsernameHint"
            className={FIELD}
          />
          <p id="acctUsernameHint" className="text-xs text-muted-foreground">
            Changing this updates the username you sign in with at /login.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="acctDisplay" className={FIELD_LABEL}>
            Display name
          </Label>
          <Input
            id="acctDisplay"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="(optional)"
            maxLength={60}
            className={FIELD}
          />
        </div>
        <Button type="submit" disabled={savingProfile} className="h-12 w-full px-6 sm:w-auto">
          {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Saving" /> : "Save profile"}
        </Button>
      </Section>

      <Section id="acctPasswordTitle" title="Password" onSubmit={savePassword}>
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={me.username}
          readOnly
          hidden
        />
        <div className="space-y-2">
          <Label htmlFor="curPwd" className={FIELD_LABEL}>
            Current password
          </Label>
          <Input
            id="curPwd"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            className={FIELD}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="newPwd" className={FIELD_LABEL}>
            New password
          </Label>
          <Input
            id="newPwd"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="at least 8 characters"
            className={FIELD}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="newPwd2" className={FIELD_LABEL}>
            Confirm new password
          </Label>
          <Input
            id="newPwd2"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            className={FIELD}
          />
        </div>
        <Button type="submit" disabled={savingPassword} className="h-12 w-full px-6 sm:w-auto">
          {savingPassword ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-label="Saving" />
          ) : (
            "Change password"
          )}
        </Button>
      </Section>
    </div>
  );
}
