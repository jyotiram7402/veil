import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/api";

/**
 * DELETE /api/messages/[id]
 * RLS enforces who can do this: the sender, or an admin of the chat.
 * Returns 403 if the caller isn't allowed.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");

  const { id } = await ctx.params;
  const supabase = await supabaseServer();
  const { error } = await supabase.from("messages").delete().eq("id", id);
  if (error) return jsonError(403, error.message);
  return NextResponse.json({ ok: true });
}
