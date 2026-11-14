import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/password";
import { clientKey, jsonError, rateLimit } from "@/lib/api";
import { usernameToInternalEmail } from "@/lib/auth/username";
import { env } from "@/lib/env";

export const runtime = "nodejs";

/**
 * POST /api/lock
 *
 * Verifies the gate password for the currently signed-in user. Used by the
 * SessionLock overlay on /chat to unlock the screen without ending the
 * Supabase session — that way the websocket stays connected and messages
 * keep flowing in.
 */
export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");

  if (!rateLimit(`lock:${session.id}:${clientKey(req)}`, 8, 60_000)) {
    return jsonError(429, "Too many attempts. Wait a minute.");
  }

  let body: { password?: string };
  try {
    body = (await req.json()) as { password?: string };
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const password = String(body.password ?? "");
  if (!password) return jsonError(400, "Password required");

  // Admins don't have an invite-gate password. They unlock by typing their
  // login password. We don't store admin passwords plaintext, so we verify by
  // attempting a no-op sign-in via the service role: not possible without
  // re-using credentials. Easier path: admins skip the lock entirely. The
  // /chat route is non-admin only anyway, so this case shouldn't trigger.
  if (session.profile.is_admin) {
    return jsonError(400, "Admins don't use the lock screen");
  }

  const admin = supabaseAdmin();
  const { data: row } = await admin
    .from("invite_tokens")
    .select("gate_password_hash, enabled, revoked_at")
    .eq("user_id", session.id)
    .is("revoked_at", null)
    .maybeSingle();

  if (!row || !row.enabled || !row.gate_password_hash) {
    // A member who signed up with a code has no invite link at all. Their lock
    // password is simply the password they log in with.
    if (!row && session.profile.signup_code_id) {
      const ok = await loginPasswordMatches(session.profile.username, password);
      if (!ok) return jsonError(401, "Wrong password");
      return NextResponse.json({ ok: true });
    }
    return jsonError(403, "No active invite — sign in again");
  }

  const ok = await verifyPassword(password, row.gate_password_hash);
  if (!ok) return jsonError(401, "Wrong password");

  return NextResponse.json({ ok: true });
}

/**
 * Checks a login password without touching the caller's own session: a
 * throwaway client signs in, and the session that creates is dropped again.
 */
async function loginPasswordMatches(username: string, password: string): Promise<boolean> {
  const probe = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await probe.auth.signInWithPassword({
    email: usernameToInternalEmail(username),
    password,
  });
  if (error || !data.session) return false;
  await probe.auth.signOut({ scope: "local" }).catch(() => undefined);
  return true;
}
