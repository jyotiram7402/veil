import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/api";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; userId: string }> },
) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");

  const { id, userId } = await ctx.params;

  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("chat_members")
    .delete()
    .eq("chat_id", id)
    .eq("user_id", userId);

  if (error) return jsonError(403, error.message);
  return NextResponse.json({ ok: true });
}
