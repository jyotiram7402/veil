import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/api";

/** Toggle suspended flag. Suspended users can't sign in via their invite link. */
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
  if (error) return jsonError(500, error.message);

  // If we're suspending, also sign them out of any active session by rotating
  // their password to something unknown.
  if (body.suspended) {
    const bytes = new Uint8Array(24);
    globalThis.crypto.getRandomValues(bytes);
    const garbage = btoa(String.fromCharCode(...bytes)).replace(/=+$/, "");
    await admin.auth.admin.updateUserById(id, { password: garbage });
  }

  return NextResponse.json({ ok: true });
}
