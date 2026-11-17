import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getAuthUserId } from "@/lib/auth/session";
import { jsonError } from "@/lib/api";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId();
  if (!userId) return jsonError(401, "Sign in required");

  const { id } = await ctx.params;
  const supabase = await supabaseServer();
  const { error } = await supabase.from("messages").delete().eq("id", id);
  if (error) return jsonError(403, "Not allowed");
  return NextResponse.json({ ok: true });
}
