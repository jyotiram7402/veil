export const INVITE_HOURS = 48;
export const DIRECT_LINK_HOURS = 48;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export const KEEP_OPEN = ["48h", "7d", "30d", "always"] as const;
export type KeepOpen = (typeof KEEP_OPEN)[number];

export const KEEP_OPEN_LABELS: Record<KeepOpen, string> = {
  "48h": "48 hours",
  "7d": "7 days",
  "30d": "30 days",
  always: "Always",
};

const KEEP_OPEN_MS: Record<Exclude<KeepOpen, "always">, number> = {
  "48h": INVITE_HOURS * HOUR_MS,
  "7d": 7 * DAY_MS,
  "30d": 30 * DAY_MS,
};

export function openUntil(choice: KeepOpen, now: number = Date.now()): string | null {
  return choice === "always" ? null : new Date(now + KEEP_OPEN_MS[choice]).toISOString();
}

export function inviteEnd(now: number = Date.now()): string {
  return new Date(now + INVITE_HOURS * HOUR_MS).toISOString();
}

export function directLinkEnd(now: number = Date.now()): string {
  return new Date(now + DIRECT_LINK_HOURS * HOUR_MS).toISOString();
}

export type LinkState = "open" | "off" | "ended" | "none";

export function linkState(
  link: { enabled: boolean; revoked_at?: string | null; expires_at?: string | null } | null | undefined,
  now: number = Date.now(),
): LinkState {
  if (!link || link.revoked_at) return "none";
  if (!link.enabled) return "off";
  if (link.expires_at && Date.parse(link.expires_at) <= now) return "ended";
  return "open";
}

function amount(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return hours === 1 ? "1 hour" : `${hours} hours`;
  return `${Math.round(hours / 24)} days`;
}

export function endsLine(expiresAt: string | null | undefined, now: number = Date.now()): string {
  if (!expiresAt) return "Never runs out";
  const left = Date.parse(expiresAt) - now;
  return left > 0 ? `Runs out in ${amount(left)}` : `Ran out ${amount(-left)} ago`;
}
