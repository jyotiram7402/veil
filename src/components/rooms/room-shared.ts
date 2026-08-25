// Shared, presentation-only helpers for the room admin UI.

export const EXPIRY_OPTIONS: Array<{ label: string; minutes: number | null }> = [
  { label: "10 minutes", minutes: 10 },
  { label: "1 hour", minutes: 60 },
  { label: "24 hours", minutes: 60 * 24 },
  { label: "7 days", minutes: 60 * 24 * 7 },
  { label: "Never", minutes: null },
];

export function statusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    active: "bg-emerald-500/15 text-emerald-500",
    ended: "bg-zinc-500/15 text-muted-foreground",
    expired: "bg-amber-500/15 text-amber-500",
    locked: "bg-sky-500/15 text-sky-500",
    revoked: "bg-destructive/15 text-destructive",
    used: "bg-zinc-500/15 text-muted-foreground",
    removed: "bg-destructive/15 text-destructive",
    blocked: "bg-amber-500/15 text-amber-500",
  };
  return map[status] ?? "bg-muted text-muted-foreground";
}
