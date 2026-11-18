import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/api";
import { letBackIn } from "@/lib/lockout";

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
  if (!(await letBackIn(id))) {
    return jsonError(500, "Restored, but they still can't sign in. Try again.");
  }
  return NextResponse.json({ ok: true });
}
