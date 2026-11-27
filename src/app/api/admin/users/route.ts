import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { usernameToInternalEmail } from "@/lib/auth/username";
import { createUserSchema } from "@/lib/validations";
import { clientKey, jsonError, parseBody, rateLimit, serverError } from "@/lib/api";
import { isTaken } from "@/lib/db-errors";
import { generateEphemeralPassword } from "@/lib/invite-token";
import { createInviteLink, hashHashcode } from "@/lib/member-access";
import { inviteUrlFor } from "@/lib/url";
import { env } from "@/lib/env";

export async function GET(req: Request) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  const url = new URL(req.url);
  const archivedParam = url.searchParams.get("archived");
  const wantArchived =
    archivedParam === "true" ? true : archivedParam === "false" ? false : null;

  const admin = supabaseAdmin();

  let q = admin
    .from("profiles")
    .select(
      "id, username, display_name, avatar_url, is_admin, last_seen_at, created_at, suspended, archived, settings",
    )
    .eq("is_room_guest", false)
    .order("created_at", { ascending: false });
  if (wantArchived !== null) q = q.eq("archived", wantArchived);

  const { data: users, error } = await q;
  if (error) return serverError("admin/users", error, "Couldn't load your members. Try again.");

  const { data: tokens } = await admin
    .from("invite_tokens")
    .select("*")
    .is("revoked_at", null);

  const tokenByUser = new Map<
    string,
    {
      token: string;
      enabled: boolean;
      use_count: number;
      last_used_at: string | null;
      expires_at: string | null;
      has_password: boolean;
    }
  >();
  for (const t of tokens ?? []) {
    tokenByUser.set(t.user_id, {
      token: t.token,
      enabled: t.enabled,
      use_count: t.use_count,
      last_used_at: t.last_used_at,
      expires_at: t.expires_at ?? null,
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
              expires_at: t.expires_at,
              has_password: t.has_password,
            }
          : null,
      };
    }),
  );

  return NextResponse.json({ users: withInvite });
}

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
    if (countErr) return serverError("admin/users", countErr, "Couldn't add the account. Try again.");

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
    return jsonError(400, finalIsAdmin ? "Admin needs a password" : "Set a hashcode");
  }

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .ilike("username", username)
    .maybeSingle();
  if (existing) return jsonError(409, "Username already taken");

  const seedPassword = finalIsAdmin ? password : generateEphemeralPassword();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: usernameToInternalEmail(username),
    password: seedPassword,
    email_confirm: true,
    user_metadata: { username },
  });
  if (createErr || !created.user) {
    if (isTaken(createErr)) return jsonError(409, "Username already taken");
    return serverError("admin/users", createErr, "Couldn't add them. Try again.");
  }

  const { error: profileErr } = await admin.from("profiles").insert({
    id: created.user.id,
    username,
    display_name: displayName ?? null,
    is_admin: finalIsAdmin,
  });
  if (profileErr) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    if (isTaken(profileErr)) return jsonError(409, "Username already taken");
    return serverError("admin/users", profileErr, "Couldn't add them. Try again.");
  }

  let invite: { token: string; url: string } | null = null;
  if (!finalIsAdmin) {
    const made = await createInviteLink(created.user.id, await hashHashcode(password));
    if (made) invite = { token: made.token, url: await inviteUrlFor(made.token) };
  }

  return NextResponse.json({
    ok: true,
    user: { id: created.user.id, username, isAdmin: finalIsAdmin },
    invite,
  });
}
