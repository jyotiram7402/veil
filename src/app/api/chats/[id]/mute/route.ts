import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUserId } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { jsonError, parseBody } from "@/lib/api";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const schema = z.object({ muted: z.boolean() });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId();
  if (!userId) return jsonError(401, "Sign in required");

  const { id } = await ctx.params;
  if (!UUID.test(id)) return jsonError(404, "Chat not found");

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const { muted } = parsed.data;

  const { data, error } = await supabaseAdmin()
    .from("chat_members")
    .update({ muted })
    .eq("chat_id", id)
    .eq("user_id", userId)
    .is("removed_at", null)
    .select("chat_id")
    .maybeSingle();

  if (error) {
    if (error.code === "PGRST204" || error.code === "42703") {
      return jsonError(503, "Muting isn't available yet");
    }
    return jsonError(500, "Something went wrong");
  }
  if (!data) return jsonError(404, "Chat not found");
  return NextResponse.json({ ok: true, muted });
}
