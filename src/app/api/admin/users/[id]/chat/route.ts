import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/api";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  const { id } = await ctx.params;
  const supabase = await supabaseServer();

  const { data, error } = await supabase.rpc("get_or_create_admin_user_chat", {
    p_user: id,
  });
  if (error) return jsonError(500, error.message);

  return NextResponse.json({ chatId: data });
}
