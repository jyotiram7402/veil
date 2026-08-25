import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError, parseBody } from "@/lib/api";
import { updateParticipantSchema } from "@/lib/validations";
import { assertRoomAdmin, recordAudit } from "@/lib/rooms";

export const runtime = "nodejs";

/**
 * PATCH — update a participant: block/unblock and/or change per-participant
 * chat/voice/video permissions. Admin-only, room-scoped, server-validated.
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; userId: string }> },
) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  const { id, userId } = await ctx.params;

  const room = await assertRoomAdmin(id, session.id, session.profile.is_admin);
  if (!room) return jsonError(403, "Not authorized for this room");
  if (userId === session.id) return jsonError(400, "You can't modify your own membership");

  const parsed = await parseBody(req, updateParticipantSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const admin = supabaseAdmin();

  // Target must be an actual participant (member role) of THIS room.
  const { data: member } = await admin
    .from("chat_members")
    .select("user_id, role")
    .eq("chat_id", id)
    .eq("user_id", userId)
    .eq("role", "member")
    .maybeSingle();
  if (!member) return jsonError(404, "Participant not found");

  const patch: Record<string, unknown> = {};
  if (body.blocked !== undefined) patch.blocked = body.blocked;
  if (body.canChat !== undefined) patch.can_chat = body.canChat;
  if (body.canVoice !== undefined) patch.can_voice = body.canVoice;
  if (body.canVideo !== undefined) patch.can_video = body.canVideo;

  const { error } = await admin
    .from("chat_members")
    .update(patch)
    .eq("chat_id", id)
    .eq("user_id", userId)
    .eq("role", "member");
  if (error) return jsonError(500, error.message);

  if (body.blocked !== undefined) {
    await recordAudit({
      roomId: id,
      actorId: session.id,
      action: body.blocked ? "participant_blocked" : "participant_unblocked",
      targetId: userId,
    });
  }
  const permKeys = ["canChat", "canVoice", "canVideo"].filter((k) => k in body);
  if (permKeys.length > 0) {
    await recordAudit({
      roomId: id,
      actorId: session.id,
      action: "permission_changed",
      targetId: userId,
      meta: {
        chat: body.canChat,
        voice: body.canVoice,
        video: body.canVideo,
      },
    });
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE — remove a participant (soft): sets removed_at so the row is retained
 * for the admin view and every future access is rejected server-side via
 * can_access_chat(). The participant's live session is invalidated on its next
 * request/realtime tick.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; userId: string }> },
) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  const { id, userId } = await ctx.params;

  const room = await assertRoomAdmin(id, session.id, session.profile.is_admin);
  if (!room) return jsonError(403, "Not authorized for this room");
  if (userId === session.id) return jsonError(400, "You can't remove yourself");

  const admin = supabaseAdmin();
  const { error } = await admin
    .from("chat_members")
    .update({ removed_at: new Date().toISOString() })
    .eq("chat_id", id)
    .eq("user_id", userId)
    .eq("role", "member")
    .is("removed_at", null);
  if (error) return jsonError(500, error.message);

  await recordAudit({
    roomId: id,
    actorId: session.id,
    action: "participant_removed",
    targetId: userId,
  });

  return NextResponse.json({ ok: true });
}
