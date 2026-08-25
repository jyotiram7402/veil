import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { clientKey, jsonError, parseBody, rateLimit } from "@/lib/api";
import { createInviteSchema } from "@/lib/validations";
import {
  assertRoomAdmin,
  expiryFromMinutes,
  generateAccessCode,
  recordAudit,
} from "@/lib/rooms";
import { appOrigin } from "@/lib/url";

export const runtime = "nodejs";

/**
 * POST — mint a new invitation for the room.
 *
 * The raw access code (and its join URL) is returned here EXACTLY ONCE. Only
 * the PBKDF2 hash of the verifier is stored; it can never be recovered later.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!rateLimit(`invite-create:${clientKey(req)}`, 60, 60_000)) {
    return jsonError(429, "Slow down");
  }
  const { id } = await ctx.params;

  const room = await assertRoomAdmin(id, session.id, session.profile.is_admin);
  if (!room) return jsonError(403, "Not authorized for this room");
  if (room.status !== "active") return jsonError(409, "Room is not active");

  const parsed = await parseBody(req, createInviteSchema);
  if (!parsed.ok) return parsed.response;
  const { label, expiresInMinutes, maxUses } = parsed.data;

  const { code, selector, verifierHash } = await generateAccessCode();

  const admin = supabaseAdmin();
  const { data: invite, error } = await admin
    .from("room_invites")
    .insert({
      room_id: id,
      selector,
      verifier_hash: verifierHash,
      label: label ?? null,
      created_by: session.id,
      // number → N minutes; null → never; omitted → 24h default so invites are
      // never accidentally permanent.
      expires_at: expiryFromMinutes(expiresInMinutes === undefined ? 60 * 24 : expiresInMinutes),
      max_uses: maxUses ?? null,
    })
    .select("id, expires_at, max_uses")
    .single();
  if (error || !invite) return jsonError(500, error?.message ?? "Could not create invite");

  await recordAudit({
    roomId: id,
    actorId: session.id,
    action: "invite_created",
    targetId: invite.id,
    meta: { max_uses: invite.max_uses, expires_at: invite.expires_at },
  });

  const origin = await appOrigin();
  return NextResponse.json({
    invite: {
      id: invite.id,
      code, // shown once
      url: `${origin}/join/${encodeURIComponent(code)}`,
      expires_at: invite.expires_at,
      max_uses: invite.max_uses,
    },
  });
}
