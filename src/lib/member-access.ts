import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isNotSetUp } from "@/lib/db-errors";
import { generateInviteToken } from "@/lib/invite-token";
import { directLinkEnd, inviteEnd, linkState, type LinkState } from "@/lib/invite-window";
import { hashPassword, verifyPassword } from "@/lib/password";

export const NAME_MAX = 60;

export type Member = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

type InviteRow = {
  token: string;
  user_id: string;
  enabled: boolean;
  revoked_at: string | null;
  expires_at?: string | null;
  gate_password_hash: string | null;
  use_count: number;
};

const PROFILE_COLUMNS =
  "id, username, display_name, avatar_url, is_admin, is_room_guest, suspended, archived";

type ProfileRow = Member & {
  is_admin: boolean;
  is_room_guest: boolean;
  suspended: boolean;
  archived: boolean;
};

export function normalizeName(input: string): string {
  return input.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function cleanHashcode(input: string): string {
  return input.normalize("NFC").replace(/[︎️]/g, "").trim();
}

export async function hashHashcode(input: string): Promise<string> {
  return hashPassword(cleanHashcode(input));
}

export async function hashcodeMatches(input: string, hash: string): Promise<boolean> {
  const clean = cleanHashcode(input);
  if (await verifyPassword(clean, hash)) return true;
  return clean !== input && verifyPassword(input, hash);
}

let decoy: Promise<string> | null = null;

async function spendSameTime(input: string): Promise<void> {
  decoy ??= hashPassword("no such hashcode");
  await verifyPassword(input, await decoy);
}

function likeExactly(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function canSignIn(p: ProfileRow | null | undefined): p is ProfileRow {
  return !!p && !p.is_admin && !p.is_room_guest && !p.suspended && !p.archived;
}

function asMember(p: ProfileRow): Member {
  return { id: p.id, username: p.username, display_name: p.display_name, avatar_url: p.avatar_url };
}

export async function findMemberByName(raw: string): Promise<Member | null> {
  const name = normalizeName(raw).replace(/^@/, "");
  if (!name || name.length > NAME_MAX) return null;
  const admin = supabaseAdmin();

  const { data: byUsername } = await admin
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("username", name)
    .maybeSingle();
  if (byUsername) return canSignIn(byUsername) ? asMember(byUsername) : null;

  const { data: byName } = await admin
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .ilike("display_name", likeExactly(name))
    .eq("is_admin", false)
    .eq("is_room_guest", false)
    .eq("archived", false)
    .limit(2);
  const only = byName?.length === 1 ? byName[0] : undefined;
  return canSignIn(only) ? asMember(only) : null;
}

async function activeInvite(userId: string): Promise<InviteRow | null> {
  const { data } = await supabaseAdmin()
    .from("invite_tokens")
    .select("*")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();
  return (data as InviteRow | null) ?? null;
}

export async function inviteLinkState(token: string): Promise<LinkState> {
  const admin = supabaseAdmin();
  const { data: row } = await admin.from("invite_tokens").select("*").eq("token", token).maybeSingle();
  if (!row) return "none";
  const { data: person } = await admin
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", row.user_id)
    .maybeSingle();
  return canSignIn(person) ? linkState(row) : "none";
}

export async function createInviteLink(
  userId: string,
  hash: string,
): Promise<{ token: string } | null> {
  const admin = supabaseAdmin();
  const token = generateInviteToken();
  const row = { token, user_id: userId, enabled: true, gate_password_hash: hash };
  let { error } = await admin.from("invite_tokens").insert({ ...row, expires_at: inviteEnd() });
  if (error && isNotSetUp(error)) ({ error } = await admin.from("invite_tokens").insert(row));
  return error ? null : { token };
}

export type LoginCheck =
  | { ok: true; member: Member; invite: { token: string; use_count: number } }
  | { ok: false; reason: "wrong" | "off" | "ended" };

export async function checkMemberLogin(name: string, hashcode: string): Promise<LoginCheck> {
  const member = await findMemberByName(name);
  const invite = member ? await activeInvite(member.id) : null;
  if (!member || !invite?.gate_password_hash) {
    await spendSameTime(hashcode);
    return { ok: false, reason: "wrong" };
  }
  if (!(await hashcodeMatches(hashcode, invite.gate_password_hash))) {
    return { ok: false, reason: "wrong" };
  }
  const state = linkState(invite);
  if (state === "off" || state === "ended") return { ok: false, reason: state };
  return { ok: true, member, invite: { token: invite.token, use_count: invite.use_count } };
}

export async function recordSignIn(invite: { token: string; use_count: number }): Promise<void> {
  await supabaseAdmin()
    .from("invite_tokens")
    .update({ last_used_at: new Date().toISOString(), use_count: invite.use_count + 1 })
    .eq("token", invite.token);
}

export type DirectLinkMade =
  | { ok: true; token: string }
  | { ok: false; reason: "not-member" | "suspended" | "not-set-up" | "failed" };

export async function makeDirectLink(userId: string, hashcode: string): Promise<DirectLinkMade> {
  const admin = supabaseAdmin();
  const { data: person } = await admin
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (!person || person.is_admin || person.is_room_guest || person.archived) {
    return { ok: false, reason: "not-member" };
  }
  if (person.suspended) return { ok: false, reason: "suspended" };

  const now = new Date();
  const retired = await admin
    .from("direct_links")
    .update({ used_at: now.toISOString() })
    .eq("user_id", userId)
    .is("used_at", null);
  if (retired.error) {
    return { ok: false, reason: isNotSetUp(retired.error) ? "not-set-up" : "failed" };
  }

  const token = generateInviteToken();
  const made = await admin
    .from("direct_links")
    .insert({ token, user_id: userId, expires_at: directLinkEnd(now.getTime()) });
  if (made.error) return { ok: false, reason: "failed" };

  const hash = await hashHashcode(hashcode);
  const invite = await activeInvite(userId);
  const saved = invite
    ? !(
        await admin
          .from("invite_tokens")
          .update({ gate_password_hash: hash })
          .eq("token", invite.token)
      ).error
    : (await createInviteLink(userId, hash)) !== null;
  if (!saved) {
    await admin.from("direct_links").delete().eq("token", token);
    return { ok: false, reason: "failed" };
  }

  await admin
    .from("hashcode_requests")
    .update({ resolved_at: now.toISOString() })
    .eq("user_id", userId)
    .is("resolved_at", null);
  return { ok: true, token };
}

async function liveDirectLink(token: string): Promise<{ user_id: string } | null> {
  const { data: link } = await supabaseAdmin()
    .from("direct_links")
    .select("token, user_id, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();
  if (!link || link.used_at || Date.parse(link.expires_at) <= Date.now()) return null;
  return link;
}

async function signInable(userId: string): Promise<Member | null> {
  const { data: person } = await supabaseAdmin()
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  return canSignIn(person) ? asMember(person) : null;
}

export async function directLinkMember(token: string): Promise<Member | null> {
  const link = await liveDirectLink(token);
  return link ? signInable(link.user_id) : null;
}

export type DirectCheck = { ok: true; member: Member } | { ok: false; reason: "gone" | "wrong" };

export async function checkDirectLink(token: string, hashcode: string): Promise<DirectCheck> {
  const link = await liveDirectLink(token);
  const member = link ? await signInable(link.user_id) : null;
  if (!member) {
    await spendSameTime(hashcode);
    return { ok: false, reason: "gone" };
  }
  const invite = await activeInvite(member.id);
  if (!invite?.gate_password_hash || !(await hashcodeMatches(hashcode, invite.gate_password_hash))) {
    return { ok: false, reason: "wrong" };
  }
  return { ok: true, member };
}

export async function claimDirectLink(token: string): Promise<boolean> {
  const { data } = await supabaseAdmin()
    .from("direct_links")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token)
    .is("used_at", null)
    .select("token");
  return (data ?? []).length === 1;
}

export async function releaseDirectLink(token: string): Promise<void> {
  await supabaseAdmin().from("direct_links").update({ used_at: null }).eq("token", token);
}

export type RequestFiled =
  | { status: "filed"; member: Member }
  | { status: "unknown" }
  | { status: "not-set-up" };

export async function fileHashcodeRequest(raw: string, device: string | null): Promise<RequestFiled> {
  const admin = supabaseAdmin();
  const probe = await admin.from("hashcode_requests").select("id").limit(1);
  if (probe.error) return { status: "not-set-up" };

  const member = await findMemberByName(raw);
  if (!member) return { status: "unknown" };

  const typed = raw.normalize("NFC").trim().replace(/\s+/g, " ").slice(0, NAME_MAX);
  const at = new Date().toISOString();
  const { data: open } = await admin
    .from("hashcode_requests")
    .select("id")
    .eq("user_id", member.id)
    .is("resolved_at", null)
    .maybeSingle();
  if (open) {
    await admin
      .from("hashcode_requests")
      .update({ typed_name: typed, device, created_at: at })
      .eq("id", open.id);
  } else {
    await admin
      .from("hashcode_requests")
      .insert({ user_id: member.id, typed_name: typed, device, created_at: at });
  }
  return { status: "filed", member };
}

export type OpenRequest = {
  id: string;
  user_id: string;
  typed_name: string;
  device: string | null;
  created_at: string;
};

export async function openHashcodeRequests(): Promise<OpenRequest[] | null> {
  const { data, error } = await supabaseAdmin()
    .from("hashcode_requests")
    .select("id, user_id, typed_name, device, created_at")
    .is("resolved_at", null)
    .order("created_at", { ascending: false });
  return error ? null : (data ?? []);
}

export async function dismissHashcodeRequest(id: string): Promise<boolean> {
  const { error } = await supabaseAdmin()
    .from("hashcode_requests")
    .update({ resolved_at: new Date().toISOString() })
    .eq("id", id)
    .is("resolved_at", null);
  return !error;
}
