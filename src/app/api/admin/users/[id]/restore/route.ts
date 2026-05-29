import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/api";

/**
 * POST /api/admin/users/[id]/restore
 * Un-archives a user. Their invite link must be re-issued separately
 * (their old token was revoked when they were soft-deleted).
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  const { id } = await ctx.params;
  const admin = supabaseAdmin();
  const { error } = await admin
    .from("profiles")
    .update({ archived: false, suspended: false })
    .eq("id", id);
  if (error) return jsonError(500, error.message);
  return NextResponse.json({ ok: true });
}
