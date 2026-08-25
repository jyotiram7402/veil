import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/api";
import { assertRoomAdmin, recordAudit } from "@/lib/rooms";

export const runtime = "nodejs";

/** DELETE — revoke an invitation. Revocation is enforced server-side on join. */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; inviteId: string }> },
) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  const { id, inviteId } = await ctx.params;

  const room = await assertRoomAdmin(id, session.id, session.profile.is_admin);
  if (!room) return jsonError(403, "Not authorized for this room");

  const admin = supabaseAdmin();
  const { error } = await admin
    .from("room_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId)
    .eq("room_id", id)
    .is("revoked_at", null);
  if (error) return jsonError(500, error.message);

  await recordAudit({
    roomId: id,
    actorId: session.id,
    action: "invite_revoked",
    targetId: inviteId,
  });

  return NextResponse.json({ ok: true });
}
