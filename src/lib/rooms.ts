import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hashPassword, verifyPassword } from "@/lib/password";

export const JOIN_FAILURE = "Invalid or expired invitation.";

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

export async function generateAccessCode(): Promise<{
  code: string;
  selector: string;
  verifierHash: string;
}> {
  const selector = base64url(randomBytes(9));
  const verifier = base64url(randomBytes(32));
  const verifierHash = await hashPassword(verifier);
  return { code: `${selector}.${verifier}`, selector, verifierHash };
}

export function parseAccessCode(raw: string): { selector: string; verifier: string } | null {
  const code = raw.trim();
  const dot = code.indexOf(".");
  if (dot <= 0 || dot === code.length - 1) return null;
  const selector = code.slice(0, dot);
  const verifier = code.slice(dot + 1);
  if (selector.length < 6 || selector.length > 64) return null;
  if (verifier.length < 16 || verifier.length > 128) return null;
  return { selector, verifier };
}

export function generateGuestUsername(): string {
  return `guest_${base64url(randomBytes(9)).replace(/[^a-z0-9_]/gi, "").toLowerCase()}`.slice(0, 24);
}

export async function assertRoomAdmin(
  roomId: string,
  userId: string,
  isGlobalAdmin: boolean,
) {
  if (!isGlobalAdmin) return null;
  const admin = supabaseAdmin();
  const { data: room } = await admin
    .from("chats")
    .select("*")
    .eq("id", roomId)
    .eq("type", "room")
    .maybeSingle();
  if (!room) return null;

  if (room.created_by === userId) return room;

  const { data: membership } = await admin
    .from("chat_members")
    .select("role")
    .eq("chat_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();

  return membership?.role === "admin" ? room : null;
}

export async function recordAudit(params: {
  roomId: string | null;
  actorId: string | null;
  action: string;
  targetId?: string | null;
  meta?: Record<string, unknown>;
}) {
  const admin = supabaseAdmin();
  await admin
    .from("room_audit_log")
    .insert({
      room_id: params.roomId,
      actor_id: params.actorId,
      action: params.action,
      target_id: params.targetId ?? null,
      meta: (params.meta ?? {}) as never,
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

export type JoinValidation =
  | { ok: false }
  | {
      ok: true;
      roomId: string;
      inviteId: string;
      selector: string;
      useCount: number;
    };

export async function validateInvite(rawCode: string): Promise<JoinValidation> {
  const parsed = parseAccessCode(rawCode);
  if (!parsed) return { ok: false };

  const admin = supabaseAdmin();
  const { data: invite } = await admin
    .from("room_invites")
    .select("id, room_id, verifier_hash, expires_at, revoked_at, max_uses, use_count")
    .eq("selector", parsed.selector)
    .maybeSingle();
  if (!invite) return { ok: false };

  if (invite.revoked_at) return { ok: false };
  if (invite.expires_at && new Date(invite.expires_at) <= new Date()) return { ok: false };
  if (invite.max_uses != null && invite.use_count >= invite.max_uses) return { ok: false };

  const ok = await verifyPassword(parsed.verifier, invite.verifier_hash);
  if (!ok) return { ok: false };

  const { data: room } = await admin
    .from("chats")
    .select("id, type, status, expires_at, max_participants")
    .eq("id", invite.room_id)
    .maybeSingle();
  if (!room || room.type !== "room" || room.status !== "active") return { ok: false };
  if (room.expires_at && new Date(room.expires_at) <= new Date()) return { ok: false };

  if (room.max_participants != null) {
    const { count } = await admin
      .from("chat_members")
      .select("user_id", { head: true, count: "exact" })
      .eq("chat_id", room.id)
      .eq("role", "member")
      .eq("blocked", false)
      .is("removed_at", null);
    if ((count ?? 0) >= room.max_participants) return { ok: false };
  }

  return {
    ok: true,
    roomId: room.id,
    inviteId: invite.id,
    selector: parsed.selector,
    useCount: invite.use_count,
  };
}

export function expiryFromMinutes(minutes: number | null | undefined): string | null {
  if (minutes == null) return null;
  const clamped = Math.min(Math.max(Math.floor(minutes), 1), 60 * 24 * 30);
  return new Date(Date.now() + clamped * 60_000).toISOString();
}
