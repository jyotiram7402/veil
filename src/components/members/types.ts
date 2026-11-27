import { lastSeen } from "@/lib/format";
import { linkState } from "@/lib/invite-window";

export type Invite = {
  url: string;
  enabled: boolean;
  use_count: number;
  last_used_at: string | null;
  expires_at: string | null;
  has_password: boolean;
};

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

export type HashcodeRequest = {
  id: string;
  user_id: string;
  typed_name: string;
  device: string | null;
  created_at: string;
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

export function seen(iso: string): string {
  return `Seen ${lastSeen(iso)}`;
}

export type Tone = "online" | "blocked" | "attention" | "plain";

export function statusOf(p: Person, online: boolean, asked = false): { text: string; tone: Tone } {
  if (p.archived) return { text: "Archived · can't sign in", tone: "plain" };
  if (p.suspended) return { text: "Suspended · can't sign in", tone: "blocked" };
  if (asked) return { text: "Asked for their hashcode", tone: "attention" };
  if (online) return { text: "Online", tone: "online" };
  const link = linkState(p.invite);
  if (link === "off") return { text: "Link switched off", tone: "plain" };
  if (link === "ended") return { text: "Link ran out", tone: "plain" };
  if (p.invite && p.invite.use_count === 0) return { text: "Hasn't signed in yet", tone: "plain" };
  return { text: seen(p.last_seen_at), tone: "plain" };
}
