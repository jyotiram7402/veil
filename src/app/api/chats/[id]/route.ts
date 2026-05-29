import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError, parseBody } from "@/lib/api";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  avatarUrl: z.string().url().optional().or(z.literal("")),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  const { id } = await ctx.params;

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("chats")
    .select(
      `
        id, type, name, avatar_url, created_by, created_at, updated_at,
        members:chat_members(
          role, joined_at, last_read_at,
          user:profiles(id, username, display_name, avatar_url, last_seen_at)
        )
      `,
    )
    .eq("id", id)
    .single();

  if (error) return jsonError(404, "Chat not found");
  return NextResponse.json({ chat: data });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  const { id } = await ctx.params;

  const parsed = await parseBody(req, patchSchema);
  if (!parsed.ok) return parsed.response;

  const supabase = await supabaseServer();
  const patch: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.avatarUrl !== undefined) {
    patch.avatar_url = parsed.data.avatarUrl.length > 0 ? parsed.data.avatarUrl : null;
  }

  const { error } = await supabase.from("chats").update(patch).eq("id", id);
  if (error) return jsonError(403, error.message);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  const { id } = await ctx.params;

  const supabase = await supabaseServer();
  const { error } = await supabase.from("chats").delete().eq("id", id);
  if (error) return jsonError(403, error.message);
  return NextResponse.json({ ok: true });
}
