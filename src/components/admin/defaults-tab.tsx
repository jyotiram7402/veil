"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CallRelayCheck } from "@/components/admin/call-relay-check";
import { DISAPPEARING_WARNING, ListSkeleton, ToggleRow } from "@/components/admin/parts";
import { FIELD, PANEL } from "@/components/form-styles";
import { cn } from "@/lib/utils";

export function DefaultsTab() {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/settings", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { settings: Record<string, unknown> };
        setSettings(body.settings);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    try {
      const merged = { ...settings, ...patch };
      setSettings(merged);
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        toast.error("Couldn't save");
        return;
      }
      toast.success("Saved");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ListSkeleton rows={2} />;

  return (
    <div className="space-y-5">
      <p className="px-1 text-sm text-muted-foreground">
        These apply to everyone. To change one for a single person, use the menu next to their
        name in Members.
      </p>

      <section aria-label="Chat settings" className={cn(PANEL, "divide-y divide-border/70 overflow-hidden")}>
        <ToggleRow
          title="Allow file uploads"
          description="Whether users can attach images and files to messages."
          value={Boolean(settings.uploads_enabled)}
          onChange={(v) => save({ uploads_enabled: v })}
          disabled={saving}
        />
        <ToggleRow
          title="Show typing indicators"
          description='The "… is typing" bubble while someone composes.'
          value={Boolean(settings.typing_indicator)}
          onChange={(v) => save({ typing_indicator: v })}
          disabled={saving}
        />
        <ToggleRow
          title="Lock screen on blur"
          description="Hide the chat behind a password prompt whenever the user looks away."
          value={Boolean(settings.screen_guard)}
          onChange={(v) => save({ screen_guard: v })}
          disabled={saving}
        />
        <ToggleRow
          title="Disappearing messages"
          description="A message is deleted for both people, for good, once the person it was sent to has read it and leaves the chat. Photos and files go too. Nobody can bring them back, not even you."
          value={Boolean(settings.disappearing_messages)}
          onChange={(v) => {
            if (v && !confirm(DISAPPEARING_WARNING)) return;
            save({ disappearing_messages: v });
          }}
          disabled={saving}
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5">
          <div className="min-w-0 flex-1 basis-48">
            <Label htmlFor="maxLength" className="block text-[15px] font-semibold leading-snug">
              Max message length
            </Label>
            <p id="maxLengthHint" className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
              Characters. The composer enforces this on the client too.
            </p>
          </div>
          <Input
            id="maxLength"
            type="number"
            inputMode="numeric"
            value={String(settings.max_message_length ?? 4000)}
            min={100}
            max={20000}
            aria-describedby="maxLengthHint"
            onChange={(e) =>
              setSettings((s) => ({ ...s, max_message_length: parseInt(e.target.value, 10) || 4000 }))
            }
            onBlur={() => save({ max_message_length: settings.max_message_length })}
            className={cn(FIELD, "w-28 shrink-0 tabular-nums")}
          />
        </div>
      </section>

      <CallRelayCheck />
    </div>
  );
}
