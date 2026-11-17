import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/password";
import { clientKey, jsonError, rateLimit } from "@/lib/api";
import { usernameToInternalEmail } from "@/lib/auth/username";
import { env } from "@/lib/env";

export const runtime = "nodejs";

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
