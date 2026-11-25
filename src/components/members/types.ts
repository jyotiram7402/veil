import { lastSeen } from "@/lib/format";

/** A member's personal invite link, as `/api/admin/users` returns it. */
export type Invite = {
  url: string;
  enabled: boolean;
  use_count: number;
  last_used_at: string | null;
  has_password: boolean;
};

/** One account, as `/api/admin/users` returns it (archived people included). */
export type Person = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  suspended: boolean;
  archived: boolean;
  last_seen_at: string;
  created_at: string;
  invite: Invite | null;
};

/** A sign-up code, as `/api/admin/signup-codes` returns it. */
export type SignupCode = {
  id: string;
  code_hint: string;
  label: string | null;
  max_uses: number;
  use_count: number;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
  used_by: { id: string; username: string; display_name: string | null }[];
};

export function nameOf(p: Pick<Person, "display_name" | "username">): string {
  return p.display_name?.trim() || p.username;
}

export function firstName(p: Pick<Person, "display_name" | "username">): string {
  const name = nameOf(p);
  return name.split(/\s+/)[0] || name;
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** "Seen 2 hours ago", "Seen just now". */
export function seen(iso: string): string {
  return `Seen ${lastSeen(iso)}`;
}

export type Tone = "online" | "blocked" | "plain";

/** The one line under a person's name: what you would want to know at a glance. */
export function statusOf(p: Person, online: boolean): { text: string; tone: Tone } {
  if (p.archived) return { text: "Archived · can't sign in", tone: "plain" };
  if (p.suspended) return { text: "Suspended · can't sign in", tone: "blocked" };
  if (online) return { text: "Online", tone: "online" };
  if (p.invite && !p.invite.enabled) return { text: "Link switched off", tone: "plain" };
  if (p.invite && p.invite.use_count === 0) {
    return { text: "Hasn't opened their link yet", tone: "plain" };
  }
  return { text: seen(p.last_seen_at), tone: "plain" };
}

export function codeIsActive(c: SignupCode): boolean {
  if (c.revoked_at) return false;
  if (c.expires_at && new Date(c.expires_at).getTime() <= Date.now()) return false;
  return c.use_count < c.max_uses;
}

/** Why a code no longer works, or how much of it is left. */
export function codeLine(c: SignupCode): string {
  const used = `${c.use_count} of ${c.max_uses} used`;
  if (c.revoked_at) return `${used} · switched off`;
  if (c.expires_at && new Date(c.expires_at).getTime() <= Date.now()) {
    return `${used} · ran out ${shortDate(c.expires_at)}`;
  }
  if (c.use_count >= c.max_uses) return used;
  return `${used} · ${c.expires_at ? `works until ${shortDate(c.expires_at)}` : "never runs out"}`;
}

/** What a code row is called: who it is for, or its last characters. */
export function codeTitle(c: SignupCode): string {
  return c.label?.trim() || `Code ending ${c.code_hint}`;
}
