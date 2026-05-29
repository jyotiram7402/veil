import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/api";
import { generateInviteToken } from "@/lib/invite-token";
import { env } from "@/lib/env";

function inviteUrl(token: string) {
  return `${env.APP_URL.replace(/\/$/, "")}/i/${token}`;
}

/** GET — fetch the current invite link for this user (creates one if missing). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  const { id } = await ctx.params;
  const admin = supabaseAdmin();

  let { data: row } = await admin
    .from("invite_tokens")
    .select("*")
    .eq("user_id", id)
    .is("revoked_at", null)
    .maybeSingle();

  if (!row) {
    const token = generateInviteToken();
    const { data: created, error: insertErr } = await admin
      .from("invite_tokens")
      .insert({ token, user_id: id, enabled: true })
      .select()
      .single();
    if (insertErr || !created) return jsonError(500, insertErr?.message ?? "Failed");
    row = created;
  }

  return NextResponse.json({
    token: row.token,
    url: inviteUrl(row.token),
    enabled: row.enabled,
    use_count: row.use_count,
    last_used_at: row.last_used_at,
    created_at: row.created_at,
  });
}

/** POST — rotate: revoke the old token, mint a new one. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  const { id } = await ctx.params;
  const admin = supabaseAdmin();

  await admin
    .from("invite_tokens")
    .update({ revoked_at: new Date().toISOString(), enabled: false })
    .eq("user_id", id)
    .is("revoked_at", null);

  const token = generateInviteToken();
  const { data, error } = await admin
    .from("invite_tokens")
    .insert({ token, user_id: id, enabled: true })
    .select()
    .single();
  if (error || !data) return jsonError(500, error?.message ?? "Failed");

  return NextResponse.json({
    token: data.token,
    url: inviteUrl(data.token),
    enabled: true,
    use_count: 0,
  });
}

/** PATCH — enable/disable without rotating. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  const { id } = await ctx.params;
  let body: { enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  if (typeof body.enabled !== "boolean") return jsonError(400, "enabled required");

  const admin = supabaseAdmin();
  const { error } = await admin
    .from("invite_tokens")
    .update({ enabled: body.enabled })
    .eq("user_id", id)
    .is("revoked_at", null);
  if (error) return jsonError(500, error.message);
  return NextResponse.json({ ok: true });
}

/** DELETE — revoke permanently (no replacement issued). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  const { id } = await ctx.params;
  const admin = supabaseAdmin();
  const { error } = await admin
    .from("invite_tokens")
    .update({ revoked_at: new Date().toISOString(), enabled: false })
    .eq("user_id", id)
    .is("revoked_at", null);
  if (error) return jsonError(500, error.message);
  return NextResponse.json({ ok: true });
}
