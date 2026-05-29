import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { usernameToInternalEmail } from "@/lib/auth/username";
import { generateEphemeralPassword } from "@/lib/invite-token";
import { verifyPassword } from "@/lib/password";
import { clientKey, rateLimit } from "@/lib/api";

export const runtime = "nodejs";

/**
 * Password-gate handler for the invite link. Reads form-encoded body
 * (so the gate page can use a plain <form> with no JS), validates the
 * token + password, then mints a Supabase session and redirects.
 */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const url = new URL(req.url);
  const expiredUrl = new URL("/expired", url.origin);
  const gateUrl = new URL(`/i/${token}`, url.origin);

  // simple per-IP+token brute force throttle
  if (!rateLimit(`gate:${token}:${clientKey(req)}`, 8, 60_000)) {
    gateUrl.searchParams.set("error", "locked");
    return NextResponse.redirect(gateUrl, { status: 303 });
  }

  let password = "";
  try {
    const form = await req.formData();
    password = String(form.get("password") ?? "");
  } catch {
    return NextResponse.redirect(expiredUrl, { status: 303 });
  }

  const admin = supabaseAdmin();

  const { data: row } = await admin
    .from("invite_tokens")
    .select("token, user_id, enabled, revoked_at, gate_password_hash, use_count")
    .eq("token", token)
    .maybeSingle();

  if (!row || !row.enabled || row.revoked_at || !row.gate_password_hash) {
    return NextResponse.redirect(expiredUrl, { status: 303 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id, username, suspended, archived, is_admin")
    .eq("id", row.user_id)
    .maybeSingle();

  if (!profile || profile.suspended || profile.archived || profile.is_admin) {
    return NextResponse.redirect(expiredUrl, { status: 303 });
  }

  const ok = await verifyPassword(password, row.gate_password_hash);
  if (!ok) {
    gateUrl.searchParams.set("error", "invalid");
    return NextResponse.redirect(gateUrl, { status: 303 });
  }

  // Mint an ephemeral auth password and sign the browser in.
  const ephemeral = generateEphemeralPassword();
  const upd = await admin.auth.admin.updateUserById(profile.id, { password: ephemeral });
  if (upd.error) return NextResponse.redirect(expiredUrl, { status: 303 });

  const supabase = await supabaseServer();
  const email = usernameToInternalEmail(profile.username);
  const signIn = await supabase.auth.signInWithPassword({ email, password: ephemeral });
  if (signIn.error) return NextResponse.redirect(expiredUrl, { status: 303 });

  await admin
    .from("invite_tokens")
    .update({
      last_used_at: new Date().toISOString(),
      use_count: row.use_count + 1,
    })
    .eq("token", token);

  return NextResponse.redirect(new URL("/chat", url.origin), { status: 303 });
}
