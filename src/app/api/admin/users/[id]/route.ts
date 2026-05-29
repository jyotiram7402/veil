import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/api";

/**
 * Soft-delete (archive) a user.
 *
 * We deliberately don't call auth.admin.deleteUser here because that would
 * cascade and wipe the chat history admins want to keep. Instead we:
 *   - set profiles.archived = true (hides them from the picker)
 *   - revoke their invite tokens
 *   - rotate their auth password to garbage so any open session dies
 *
 * The shared chat with admin stays in the admin's chat list and archive.
 * To hard-delete (purge) a user, use ?hard=1 — that wipes auth.users and
 * cascades through everything.
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  const { id } = await ctx.params;
  if (id === session.id) return jsonError(400, "You can't delete your own account from here");

  const admin = supabaseAdmin();
  const url = new URL(req.url);
  const hard = url.searchParams.get("hard") === "1";

  if (hard) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return jsonError(500, error.message);
    return NextResponse.json({ ok: true, mode: "hard" });
  }

  // Soft delete
  await admin
    .from("invite_tokens")
    .update({ revoked_at: new Date().toISOString(), enabled: false })
    .eq("user_id", id)
    .is("revoked_at", null);

  await admin.from("profiles").update({ archived: true, suspended: true }).eq("id", id);

  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  const garbage = btoa(String.fromCharCode(...bytes)).replace(/=+$/, "");
  await admin.auth.admin.updateUserById(id, { password: garbage });

  return NextResponse.json({ ok: true, mode: "soft" });
}
