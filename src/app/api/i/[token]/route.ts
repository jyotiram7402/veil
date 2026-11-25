import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { usernameToInternalEmail } from "@/lib/auth/username";
import { generateEphemeralPassword } from "@/lib/invite-token";
import { verifyPassword } from "@/lib/password";
import { clientKey } from "@/lib/api";
import { sharedRateLimit } from "@/lib/shared-rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const url = new URL(req.url);
  const expiredUrl = new URL("/expired", url.origin);
  const gateUrl = new URL(`/i/${token}`, url.origin);

  if (!(await sharedRateLimit(`gate:${token}:${clientKey(req)}`, 8, 60_000))) {
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
