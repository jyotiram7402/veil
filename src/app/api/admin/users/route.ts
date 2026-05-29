import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { usernameToInternalEmail } from "@/lib/auth/username";
import { createUserSchema } from "@/lib/validations";
import { clientKey, jsonError, parseBody, rateLimit } from "@/lib/api";
import { generateInviteToken, generateEphemeralPassword } from "@/lib/invite-token";
import { env } from "@/lib/env";

function inviteUrl(token: string) {
  return `${env.APP_URL.replace(/\/$/, "")}/i/${token}`;
}

export async function GET() {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  const admin = supabaseAdmin();

  // pull users + their active invite tokens in two queries
  const { data: users, error } = await admin
    .from("profiles")
    .select(
      "id, username, display_name, avatar_url, is_admin, last_seen_at, created_at, suspended, archived",
    )
    .order("created_at", { ascending: false });
  if (error) return jsonError(500, error.message);

  const { data: tokens } = await admin
    .from("invite_tokens")
    .select("user_id, token, enabled, use_count, last_used_at")
    .is("revoked_at", null);

  const tokenByUser = new Map(
    (tokens ?? []).map((t) => [
      t.user_id,
      {
        url: inviteUrl(t.token),
        enabled: t.enabled,
        use_count: t.use_count,
        last_used_at: t.last_used_at,
      },
    ]),
  );

  return NextResponse.json({
    users: (users ?? []).map((u) => ({ ...u, invite: tokenByUser.get(u.id) ?? null })),
  });
}

/**
 * Create a user. Two auth paths:
 *   1. Signed-in admin: normal.
 *   2. Bootstrap: when no profiles exist, x-admin-token header must match
 *      ADMIN_BOOTSTRAP_TOKEN. The created user becomes admin.
 *
 * Body:
 *   { username, displayName?, isAdmin?, password? }
 *
 * For regular (non-admin) users we never require a password — we mint a
 * random one internally and immediately issue an invite link. For admins we
 * require a password (admins log in via /login, not invite links).
 */
export async function POST(req: Request) {
  if (!rateLimit(`admin-users:${clientKey(req)}`, 20, 60_000)) {
    return jsonError(429, "Slow down");
  }

  const parsed = await parseBody(req, createUserSchema);
  if (!parsed.ok) return parsed.response;

  const admin = supabaseAdmin();

  let isBootstrap = false;
  const session = await getSessionUser();

  if (!session || !session.profile.is_admin) {
    const { count, error: countErr } = await admin
      .from("profiles")
      .select("id", { head: true, count: "exact" });
    if (countErr) return jsonError(500, countErr.message);

    if ((count ?? 0) > 0) {
      return jsonError(403, "Admin only");
    }
    const token = req.headers.get("x-admin-token");
    if (!env.ADMIN_BOOTSTRAP_TOKEN || token !== env.ADMIN_BOOTSTRAP_TOKEN) {
      return jsonError(403, "Bootstrap token required and must match");
    }
    isBootstrap = true;
  }

  const { username, password, displayName, isAdmin } = parsed.data;
  const finalIsAdmin = isBootstrap ? true : Boolean(isAdmin);

  if (finalIsAdmin && !password) {
    return jsonError(400, "Admin users require a password");
  }

  // Check the username is free
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .ilike("username", username)
    .maybeSingle();
  if (existing) return jsonError(409, "Username already taken");

  // Non-admin users get a random initial password — it'll be rotated on every
  // invite-link visit anyway, so it never needs to be known to anyone.
  const initialPassword = password ?? generateEphemeralPassword();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: usernameToInternalEmail(username),
    password: initialPassword,
    email_confirm: true,
    user_metadata: { username },
  });
  if (createErr || !created.user) {
    return jsonError(500, createErr?.message ?? "Could not create user");
  }

  const { error: profileErr } = await admin.from("profiles").insert({
    id: created.user.id,
    username,
    display_name: displayName ?? null,
    is_admin: finalIsAdmin,
  });
  if (profileErr) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    return jsonError(500, profileErr.message);
  }

  let invite: { token: string; url: string } | null = null;
  if (!finalIsAdmin) {
    const token = generateInviteToken();
    const { error: tokenErr } = await admin
      .from("invite_tokens")
      .insert({ token, user_id: created.user.id, enabled: true });
    if (!tokenErr) {
      invite = { token, url: inviteUrl(token) };
    }
  }

  return NextResponse.json({
    ok: true,
    user: { id: created.user.id, username, isAdmin: finalIsAdmin },
    invite,
  });
}
