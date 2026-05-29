import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { usernameToInternalEmail } from "@/lib/auth/username";
import { generateEphemeralPassword } from "@/lib/invite-token";

// Node runtime: we need access to the Supabase admin SDK.
export const runtime = "nodejs";

/**
 * Invite-link entry point. The URL is unique per user.
 *
 * On every visit we:
 *   1. Validate the token exists, is enabled, not revoked, and the user is
 *      not suspended / archived.
 *   2. Rotate the user's auth.users password to a fresh random value (so a
 *      leaked DB snapshot can't be replayed and a previous device session
 *      is implicitly invalidated).
 *   3. Sign the browser in via signInWithPassword using that ephemeral
 *      password, which sets the standard Supabase session cookies.
 *   4. Increment use_count / last_used_at on the invite row.
 *   5. Redirect to /chat — the user's chat-only view.
 *
 * The token itself is never single-use; admins can revoke or disable it
 * any time from /admin.
 */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const url = new URL(req.url);
  const expiredUrl = new URL("/expired", url.origin);

  if (!token || token.length < 16) {
    return NextResponse.redirect(expiredUrl);
  }

  const admin = supabaseAdmin();

  const { data: row } = await admin
    .from("invite_tokens")
    .select("token, user_id, enabled, revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (!row || !row.enabled || row.revoked_at) {
    return NextResponse.redirect(expiredUrl);
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id, username, suspended, archived, is_admin")
    .eq("id", row.user_id)
    .maybeSingle();

  if (!profile || profile.suspended || profile.archived) {
    return NextResponse.redirect(expiredUrl);
  }

  // Defense in depth: admins MUST log in via /login with a password. Invite
  // links are exclusively for regular users.
  if (profile.is_admin) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  // Mint a one-time password and immediately consume it
  const ephemeralPassword = generateEphemeralPassword();
  const { error: updateErr } = await admin.auth.admin.updateUserById(profile.id, {
    password: ephemeralPassword,
  });
  if (updateErr) {
    return NextResponse.redirect(expiredUrl);
  }

  // Sign the browser in via the SSR client so cookies land on the response
  const supabase = await supabaseServer();
  const email = usernameToInternalEmail(profile.username);
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password: ephemeralPassword,
  });
  if (signInErr) {
    return NextResponse.redirect(expiredUrl);
  }

  await admin
    .from("invite_tokens")
    .update({
      last_used_at: new Date().toISOString(),
      use_count: (await currentUseCount(admin, token)) + 1,
    })
    .eq("token", token);

  return NextResponse.redirect(new URL("/chat", url.origin));
}

async function currentUseCount(admin: ReturnType<typeof supabaseAdmin>, token: string) {
  const { data } = await admin
    .from("invite_tokens")
    .select("use_count")
    .eq("token", token)
    .maybeSingle();
  return data?.use_count ?? 0;
}
