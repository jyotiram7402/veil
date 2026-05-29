import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError, parseBody } from "@/lib/api";

const addSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(20),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  const { id } = await ctx.params;

  const parsed = await parseBody(req, addSchema);
  if (!parsed.ok) return parsed.response;

  const supabase = await supabaseServer();
  const rows = parsed.data.userIds.map((uid) => ({
    chat_id: id,
    user_id: uid,
    role: "member" as const,
  }));
  const { error } = await supabase.from("chat_members").upsert(rows, { onConflict: "chat_id,user_id" });
  if (error) return jsonError(403, error.message);
  return NextResponse.json({ ok: true });
}
