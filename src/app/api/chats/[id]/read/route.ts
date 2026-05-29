import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/api";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  const { id } = await ctx.params;

  const supabase = await supabaseServer();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("chat_members")
    .update({ last_read_at: now })
    .eq("chat_id", id)
    .eq("user_id", session.id);

  if (error) return jsonError(500, error.message);
  return NextResponse.json({ ok: true, at: now });
}
