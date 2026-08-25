import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/api";
import { getEffectivePermissions } from "@/lib/permissions";

export const runtime = "nodejs";

/**
 * GET — the current participant's own effective permissions in a room.
 *
 * This is the read side of the effective-permission model: the browser is told
 * only what it is allowed to do (chat/voice/video) plus coarse room/membership
 * state. It never exposes admin data or other participants. The call UI
 * gates mic/camera on the same `voice`/`video` booleans.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  const { id } = await ctx.params;

  const perms = await getEffectivePermissions(id, session.id);
  if (!perms) return jsonError(404, "Room not found");

  return NextResponse.json({ permissions: perms });
}
