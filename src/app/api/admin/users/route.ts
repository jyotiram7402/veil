import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { usernameToInternalEmail } from "@/lib/auth/username";
import { createUserSchema } from "@/lib/validations";
import { clientKey, jsonError, parseBody, rateLimit } from "@/lib/api";
import { generateInviteToken, generateEphemeralPassword } from "@/lib/invite-token";
import { hashPassword } from "@/lib/password";
import { inviteUrlFor } from "@/lib/url";
import { env } from "@/lib/env";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  const admin = supabaseAdmin();

  const { data: users, error } = await admin
    .from("profiles")
    .select(
      "id, username, display_name, avatar_url, is_admin, last_seen_at, created_at, suspended, archived, settings",
    )
    .order("created_at", { ascending: false });
  if (error) return jsonError(500, error.message);

  const { data: tokens } = await admin
    .from("invite_tokens")
    .select("user_id, token, enabled, use_count, last_used_at, gate_password_hash")
    .is("revoked_at", null);

  const tokenByUser = new Map<string, { token: string; enabled: boolean; use_count: number; last_used_at: string | null; has_password: boolean }>();
  for (const t of tokens ?? []) {
    tokenByUser.set(t.user_id, {
      token: t.token,
      enabled: t.enabled,
      use_count: t.use_count,
      last_used_at: t.last_used_at,
      has_password: !!t.gate_password_hash,
    });
  }

  const withInvite = await Promise.all(
    (users ?? []).map(async (u) => {
      const t = tokenByUser.get(u.id);
      return {
        ...u,
        invite: t
          ? {
              url: await inviteUrlFor(t.token),
              enabled: t.enabled,
              use_count: t.use_count,
              last_used_at: t.last_used_at,
              has_password: t.has_password,
            }
          : null,
      };
    }),
  );

  return NextResponse.json({ users: withInvite });
}

/**
 * Create a user.
 *
 * Admin users:    require `password` (used to log in at /login).
 * Regular users:  require `password` (used to gate the invite link).
 *
 * For the very first profile, we accept `x-admin-token` instead of an admin
 * session and the new user is auto-promoted to admin.
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

    if ((count ?? 0) > 0) return jsonError(403, "Admin only");

    const token = req.headers.get("x-admin-token");
    if (!env.ADMIN_BOOTSTRAP_TOKEN || token !== env.ADMIN_BOOTSTRAP_TOKEN) {
      return jsonError(403, "Bootstrap token required and must match");
    }
    isBootstrap = true;
  }

  const { username, password, displayName, isAdmin } = parsed.data;
  const finalIsAdmin = isBootstrap ? true : Boolean(isAdmin);

  if (!password) {
    return jsonError(400, finalIsAdmin ? "Admin needs a password" : "Set an invite password");
  }

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .ilike("username", username)
    .maybeSingle();
  if (existing) return jsonError(409, "Username already taken");

  // Auth user: admin uses the password to log in. For regular users we never
  // need it to be valid for /login — we rotate it to junk on every invite
  // visit anyway. We seed with the same value just to satisfy the API.
  const seedPassword = finalIsAdmin ? password : generateEphemeralPassword();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: usernameToInternalEmail(username),
    password: seedPassword,
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
    const gate_password_hash = await hashPassword(password);
    const { error: tokenErr } = await admin
      .from("invite_tokens")
      .insert({ token, user_id: created.user.id, enabled: true, gate_password_hash });
    if (!tokenErr) {
      invite = { token, url: await inviteUrlFor(token) };
    }
  }

  return NextResponse.json({
    ok: true,
    user: { id: created.user.id, username, isAdmin: finalIsAdmin },
    invite,
  });
}
