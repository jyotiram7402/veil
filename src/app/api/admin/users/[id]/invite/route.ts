import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError, serverError } from "@/lib/api";
import { isNotSetUp } from "@/lib/db-errors";
import { KEEP_OPEN, openUntil } from "@/lib/invite-window";
import { createInviteLink, hashHashcode } from "@/lib/member-access";
import { inviteUrlFor } from "@/lib/url";
import { hashcodeSchema } from "@/lib/validations";
import type { Database } from "@/types/database";

const rotateSchema = z.object({
  password: hashcodeSchema.optional(),
});

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  password: hashcodeSchema.optional(),
  keepOpen: z.enum(KEEP_OPEN).optional(),
});

async function activeRow(userId: string) {
  const { data } = await supabaseAdmin()
    .from("invite_tokens")
    .select("*")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();
  return data;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  const { id } = await ctx.params;
  const row = await activeRow(id);
  if (!row) return NextResponse.json({ invite: null });

  return NextResponse.json({
    invite: {
      token: row.token,
      url: await inviteUrlFor(row.token),
      enabled: row.enabled,
      use_count: row.use_count,
      last_used_at: row.last_used_at,
      created_at: row.created_at,
      expires_at: row.expires_at ?? null,
      has_password: !!row.gate_password_hash,
    },
  });
}

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
  if (!parsed.success) return jsonError(422, "The hashcode needs at least 4 characters.");

  const current = await activeRow(id);
  const hash = parsed.data.password
    ? await hashHashcode(parsed.data.password)
    : current?.gate_password_hash;
  if (!hash) return jsonError(422, "Set a hashcode for the new link.");

  const admin = supabaseAdmin();
  await admin
    .from("invite_tokens")
    .update({ revoked_at: new Date().toISOString(), enabled: false })
    .eq("user_id", id)
    .is("revoked_at", null);

  const made = await createInviteLink(id, hash);
  if (!made) {
    return serverError("admin/users/[id]/invite", null, "Couldn't make the link. Try again.");
  }
  const row = await activeRow(id);

  return NextResponse.json({
    invite: {
      token: made.token,
      url: await inviteUrlFor(made.token),
      enabled: true,
      use_count: 0,
      last_used_at: null,
      expires_at: row?.expires_at ?? null,
      has_password: true,
    },
  });
}

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
  if (!parsed.success) return jsonError(422, "The hashcode needs at least 4 characters.");

  const patch: Database["public"]["Tables"]["invite_tokens"]["Update"] = {};
  if (parsed.data.enabled !== undefined) patch.enabled = parsed.data.enabled;
  if (parsed.data.password !== undefined) {
    patch.gate_password_hash = await hashHashcode(parsed.data.password);
  }
  if (parsed.data.keepOpen !== undefined) patch.expires_at = openUntil(parsed.data.keepOpen);
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

  const { error } = await supabaseAdmin()
    .from("invite_tokens")
    .update(patch)
    .eq("user_id", id)
    .is("revoked_at", null);
  if (error && isNotSetUp(error)) {
    return jsonError(503, "Links can't run out yet. Run supabase/v16.sql in Supabase first.");
  }
  if (error) return serverError("admin/users/[id]/invite", error, "Couldn't change the link. Try again.");
  return NextResponse.json({ ok: true, expires_at: patch.expires_at });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  const { id } = await ctx.params;
  const { error } = await supabaseAdmin()
    .from("invite_tokens")
    .update({ revoked_at: new Date().toISOString(), enabled: false })
    .eq("user_id", id)
    .is("revoked_at", null);
  if (error) return serverError("admin/users/[id]/invite", error, "Couldn't remove the link. Try again.");
  return NextResponse.json({ ok: true });
}
