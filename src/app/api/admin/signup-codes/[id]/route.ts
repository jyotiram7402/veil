import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/api";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DELETE /api/admin/signup-codes/[id] — switch a code off.
 *
 * The row stays (so the list still shows who joined with it); it just cannot
 * be used any more. Members who already signed up with it are not affected.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  const { id } = await ctx.params;
  if (!UUID.test(id)) return jsonError(400, "Unknown code");

  const admin = supabaseAdmin();
  const { error } = await admin
    .from("signup_codes")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null);
  if (error) return jsonError(500, "Couldn't switch the code off. Try again.");

  return NextResponse.json({ ok: true });
}
