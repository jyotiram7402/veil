"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MOJI,
  MOJI_COLORS,
  mojiFor,
  mojiValue,
  parseMojiValue,
  type MojiColor,
  type MojiGroup,
} from "@/lib/moji";
import { useSessionStore } from "@/store/session-store";
import { apiErrorMessage, cn } from "@/lib/utils";
import type { Profile } from "@/types/chat";

const GROUPS: { key: MojiGroup; label: string }[] = [
  { key: "animals", label: "Animals" },
  { key: "faces", label: "Faces" },
  { key: "things", label: "Things" },
];

const COLORS = Object.keys(MOJI_COLORS) as MojiColor[];

/** What the person has now: their saved choice, or the moji picked for them. */
function startingPoint(profile: Profile): { id: string; color: MojiColor } {
  const saved = parseMojiValue(profile.avatar_url);
  if (saved) return { id: saved.id, color: saved.color };
  const auto = mojiFor(profile.id);
  const entry = MOJI.find((m) => m.emoji === auto.emoji) ?? MOJI[0]!;
  return { id: entry.id, color: entry.color };
}

/**
 * Dialog to choose your own avatar: an emoji and the colour behind it.
 * Saves to the profile as "moji:<id>:<colour>".
 */
export function MojiPicker({
  open,
  onOpenChange,
  profile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile;
}) {
  const router = useRouter();
  const patchProfile = useSessionStore((s) => s.patchProfile);
  const [choice, setChoice] = useState(() => startingPoint(profile));
  const [group, setGroup] = useState<MojiGroup>("animals");
  const [saving, setSaving] = useState(false);

  // Start from what is saved each time the picker opens.
  useEffect(() => {
    if (!open) return;
    const start = startingPoint(profile);
    setChoice(start);
    setGroup(MOJI.find((m) => m.id === start.id)?.group ?? "animals");
    // Only when it opens: typing in the profile elsewhere must not reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const entry = MOJI.find((m) => m.id === choice.id) ?? MOJI[0]!;

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: mojiValue(entry.id, choice.color) }),
      });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(apiErrorMessage(body, "Couldn't save your avatar. Try again."));
        return;
      }
      patchProfile((body as { profile: Profile }).profile);
      router.refresh();
      onOpenChange(false);
      toast.success("Avatar updated");
    } catch {
      toast.error("No connection. Check your internet and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(42rem,calc(100dvh-2rem))] w-[calc(100%-1.5rem)] max-w-md flex-col gap-0 overflow-hidden rounded-[1.75rem] p-0">
        <DialogHeader className="items-center px-6 pb-5 pt-7 text-center">
          <span
            aria-hidden="true"
            className="grid h-24 w-24 place-items-center rounded-full text-[52px] leading-none transition-colors"
            style={{ backgroundColor: MOJI_COLORS[choice.color] }}
          >
            {entry.emoji}
          </span>
          <DialogTitle className="mt-4 text-xl font-extrabold tracking-tight">
            Choose your avatar
          </DialogTitle>
          <DialogDescription>This is how other people see you.</DialogDescription>
        </DialogHeader>

        <div
          role="radiogroup"
          aria-label="Background colour"
          className="flex justify-between px-5 pb-5 sm:justify-center sm:gap-3"
        >
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={color === choice.color}
              aria-label={color}
              onClick={() => setChoice((c) => ({ ...c, color }))}
              className={cn(
                "h-7 w-7 rounded-full ring-offset-2 ring-offset-card transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                color === choice.color && "ring-2 ring-foreground",
              )}
              style={{ backgroundColor: MOJI_COLORS[color] }}
            />
          ))}
        </div>

        <div role="tablist" aria-label="Kind of avatar" className="flex gap-2 px-5 pb-2">
          {GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              role="tab"
              aria-selected={g.key === group}
              onClick={() => setGroup(g.key)}
              className={cn(
                "h-9 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                g.key === group
                  ? "bg-foreground text-background"
                  : "bg-muted text-foreground hover:bg-accent",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* The top padding keeps the selection ring of the first row from being cut off. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-1">
          <div className="grid grid-cols-6 gap-1.5">
            {MOJI.filter((m) => m.group === group).map((m) => (
              <button
                key={m.id}
                type="button"
                aria-label={m.name}
                aria-pressed={m.id === choice.id}
                // A new emoji comes with the colour it stands out on.
                onClick={() => setChoice({ id: m.id, color: m.color })}
                className={cn(
                  "grid aspect-square place-items-center rounded-2xl text-[28px] leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  m.id === choice.id ? "bg-accent ring-2 ring-primary" : "hover:bg-muted",
                )}
              >
                <span aria-hidden="true">{m.emoji}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 border-t border-border/70 px-5 py-4">
          <Button
            variant="secondary"
            className="h-12 flex-1 shadow-none"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button className="h-12 flex-1 [&_svg]:size-5" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" aria-label="Saving" /> : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
