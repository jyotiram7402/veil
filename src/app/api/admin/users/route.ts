import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { usernameToInternalEmail } from "@/lib/auth/username";
import { createUserSchema } from "@/lib/validations";
import { clientKey, jsonError, parseBody, rateLimit } from "@/lib/api";
import { env } from "@/lib/env";

/**
 * List users — admin only.
 */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("profiles")
    .select("id, username, display_name, avatar_url, is_admin, last_seen_at, created_at")
    .order("created_at", { ascending: false });

  if (error) return jsonError(500, error.message);
  return NextResponse.json({ users: data });
}

/**
 * Create a user. Two ways in:
 *   1. Signed-in admin: normal path.
 *   2. Bootstrap: when there are zero profiles, requires x-admin-token header
 *      matching ADMIN_BOOTSTRAP_TOKEN. The first user created this way is
 *      automatically flagged as admin.
 */
export async function POST(req: Request) {
  if (!rateLimit(`admin-users:${clientKey(req)}`, 20, 60_000)) {
    return jsonError(429, "Slow down");
  }

  const parsed = await parseBody(req, createUserSchema);
  if (!parsed.ok) return parsed.response;

  const admin = supabaseAdmin();

  // Determine auth path
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
    // No users yet — accept the bootstrap token instead.
    const token = req.headers.get("x-admin-token");
    if (!env.ADMIN_BOOTSTRAP_TOKEN || token !== env.ADMIN_BOOTSTRAP_TOKEN) {
      return jsonError(403, "Bootstrap token required and must match");
    }
    isBootstrap = true;
  }

  const { username, password, displayName, isAdmin } = parsed.data;

  // Pre-check that the username is free so we can return a clean 409.
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .ilike("username", username)
    .maybeSingle();
  if (existing) return jsonError(409, "Username already taken");

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: usernameToInternalEmail(username),
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (createErr || !created.user) {
    return jsonError(500, createErr?.message ?? "Could not create user");
  }

  const finalIsAdmin = isBootstrap ? true : Boolean(isAdmin);

  const { error: profileErr } = await admin.from("profiles").insert({
    id: created.user.id,
    username,
    display_name: displayName ?? null,
    is_admin: finalIsAdmin,
  });

  if (profileErr) {
    // Roll back the auth user so the username doesn't strand.
    await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    return jsonError(500, profileErr.message);
  }

  return NextResponse.json({
    ok: true,
    user: { id: created.user.id, username, isAdmin: finalIsAdmin },
  });
}
