import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/api";
import { generateInviteToken } from "@/lib/invite-token";
import { hashPassword } from "@/lib/password";
import { inviteUrlFor } from "@/lib/url";

const rotateSchema = z.object({
  password: z.string().min(4).max(128),
});

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  password: z.string().min(4).max(128).optional(),
});

/** GET — current invite link state for this user. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  const { id } = await ctx.params;
  const admin = supabaseAdmin();

  const { data: row } = await admin
    .from("invite_tokens")
    .select("*")
    .eq("user_id", id)
    .is("revoked_at", null)
    .maybeSingle();

  if (!row) return NextResponse.json({ invite: null });

  return NextResponse.json({
    invite: {
      token: row.token,
      url: await inviteUrlFor(row.token),
      enabled: row.enabled,
      use_count: row.use_count,
      last_used_at: row.last_used_at,
      created_at: row.created_at,
      has_password: !!row.gate_password_hash,
    },
  });
}

/** POST — rotate: revoke the old token and issue a new one with a new password. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const parsed = rotateSchema.safeParse(body);
  if (!parsed.success) return jsonError(422, "password (>= 4 chars) required");

  const admin = supabaseAdmin();
  await admin
    .from("invite_tokens")
    .update({ revoked_at: new Date().toISOString(), enabled: false })
    .eq("user_id", id)
    .is("revoked_at", null);

  const token = generateInviteToken();
  const gate_password_hash = await hashPassword(parsed.data.password);
  const { data, error } = await admin
    .from("invite_tokens")
    .insert({ token, user_id: id, enabled: true, gate_password_hash })
    .select()
    .single();
  if (error || !data) return jsonError(500, error?.message ?? "Failed");

  return NextResponse.json({
    invite: {
      token: data.token,
      url: await inviteUrlFor(data.token),
      enabled: true,
      use_count: 0,
      has_password: true,
    },
  });
}

/** PATCH — enable/disable, or change the password without rotating the URL. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return jsonError(422, "Bad body");

  const patch: Record<string, unknown> = {};
  if (parsed.data.enabled !== undefined) patch.enabled = parsed.data.enabled;
  if (parsed.data.password !== undefined) {
    patch.gate_password_hash = await hashPassword(parsed.data.password);
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

  const admin = supabaseAdmin();
  const { error } = await admin
    .from("invite_tokens")
    .update(patch)
    .eq("user_id", id)
    .is("revoked_at", null);
  if (error) return jsonError(500, error.message);
  return NextResponse.json({ ok: true });
}

/** DELETE — revoke permanently. */
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
