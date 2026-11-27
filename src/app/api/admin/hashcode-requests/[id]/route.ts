import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/api";
import { dismissHashcodeRequest } from "@/lib/member-access";

export const runtime = "nodejs";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return jsonError(404, "No such request");
  if (!(await dismissHashcodeRequest(id))) {
    return jsonError(500, "Couldn't dismiss the request. Try again.");
  }
  return NextResponse.json({ ok: true });
}
