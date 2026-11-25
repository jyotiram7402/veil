import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError, serverError } from "@/lib/api";
import { letBackIn, lockOut } from "@/lib/lockout";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  const { id } = await ctx.params;
  if (id === session.id) return jsonError(400, "Can't suspend yourself");

  let body: { suspended?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  if (typeof body.suspended !== "boolean") return jsonError(400, "suspended required");

  const admin = supabaseAdmin();
  const { error } = await admin
    .from("profiles")
    .update({ suspended: body.suspended })
    .eq("id", id);
  if (error) return serverError("admin/users/[id]/suspend", error, "Couldn't change that. Try again.");

  if (body.suspended) {
    await lockOut(id);
  } else if (!(await letBackIn(id))) {
    return jsonError(500, "Unsuspended, but they still can't sign in. Try again.");
  }

  return NextResponse.json({ ok: true });
}
