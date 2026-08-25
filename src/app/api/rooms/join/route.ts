import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { usernameToInternalEmail } from "@/lib/auth/username";
import { generateEphemeralPassword } from "@/lib/invite-token";
import { clientKey, jsonError, parseBody, rateLimit } from "@/lib/api";
import { joinRoomSchema } from "@/lib/validations";
import {
  JOIN_FAILURE,
  generateGuestUsername,
  recordAudit,
  validateInvite,
} from "@/lib/rooms";

export const runtime = "nodejs";

/**
 * Public join endpoint. Anyone can call it, so it is the most exposed surface:
 *
 *  - IP throttled to blunt brute-forcing of access codes.
 *  - Every failure returns the SAME generic error (never reveals whether a
 *    room/invite exists) with a 401.
 *  - On success it mints a fresh ephemeral Supabase user (no email/phone/PII),
 *    atomically claims a seat (race-safe capacity), consumes one invitation
 *    use, and signs the browser in — reusing the app's ephemeral-session model.
 */
export async function POST(req: Request) {
  if (!rateLimit(`room-join:${clientKey(req)}`, 10, 60_000)) {
    return jsonError(429, "Too many attempts. Try again in a minute.");
  }

  const parsed = await parseBody(req, joinRoomSchema);
  if (!parsed.ok) return parsed.response;
  const { code, displayName } = parsed.data;

  const result = await validateInvite(code);
  if (!result.ok) return jsonError(401, JOIN_FAILURE);

  const admin = supabaseAdmin();

  // 1. Mint an ephemeral guest identity (a real Supabase auth user so RLS +
  //    realtime work exactly like every other participant).
  const ephemeralPassword = generateEphemeralPassword();
  let username = generateGuestUsername();
  let created: { id: string } | null = null;

  for (let attempt = 0; attempt < 4 && !created; attempt++) {
    const { data, error } = await admin.auth.admin.createUser({
      email: usernameToInternalEmail(username),
      password: ephemeralPassword,
      email_confirm: true,
      user_metadata: { username, room_guest: true },
    });
    if (!error && data.user) {
      created = { id: data.user.id };
      break;
    }
    username = generateGuestUsername();
  }
  if (!created) return jsonError(500, "Could not create session");

  const { error: profileErr } = await admin.from("profiles").insert({
    id: created.id,
    username,
    display_name: displayName ?? null,
    is_admin: false,
    is_room_guest: true,
  });
  if (profileErr) {
    await admin.auth.admin.deleteUser(created.id).catch(() => undefined);
    return jsonError(500, "Could not create session");
  }

  const cleanup = async () => {
    await admin.from("chat_members").delete().eq("chat_id", result.roomId).eq("user_id", created!.id);
    await admin.from("profiles").delete().eq("id", created!.id);
    await admin.auth.admin.deleteUser(created!.id).catch(() => undefined);
  };

  // 2. Atomically claim a seat. The RPC serializes concurrent joins per room
  //    (advisory lock) so the participant limit can't be exceeded by a race,
  //    and refuses non-active (locked/ended) rooms.
  const { data: seat, error: seatErr } = await admin.rpc("claim_room_seat", {
    p_room: result.roomId,
    p_user: created.id,
  });
  if (seatErr || seat !== true) {
    await cleanup();
    return jsonError(401, JOIN_FAILURE);
  }

  // 3. Consume exactly one invitation use (compare-and-set guards one-time /
  //    limited-use invites against concurrent claims).
  const { data: consumed, error: consumeErr } = await admin
    .from("room_invites")
    .update({
      use_count: result.useCount + 1,
      last_used_at: new Date().toISOString(),
      claimed_by: created.id,
    })
    .eq("id", result.inviteId)
    .eq("use_count", result.useCount)
    .is("revoked_at", null)
    .select("id");
  if (consumeErr || !consumed || consumed.length === 0) {
    await cleanup();
    return jsonError(401, JOIN_FAILURE);
  }

  // 4. Sign the browser in as the guest (writes the Supabase session cookie).
  const supabase = await supabaseServer();
  const signIn = await supabase.auth.signInWithPassword({
    email: usernameToInternalEmail(username),
    password: ephemeralPassword,
  });
  if (signIn.error) {
    await cleanup();
    return jsonError(500, "Could not start session");
  }

  await recordAudit({
    roomId: result.roomId,
    actorId: created.id,
    action: "participant_joined",
    targetId: created.id,
    meta: { invite_id: result.inviteId },
  });

  return NextResponse.json({ ok: true, redirect: `/room/${result.roomId}` });
}
