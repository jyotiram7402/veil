import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { createChatSchema } from "@/lib/validations";
import { jsonError, parseBody } from "@/lib/api";
import { loadChatsForUser } from "@/lib/queries";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");

  const supabase = await supabaseServer();
  const chats = await loadChatsForUser(supabase, session.id);
  return NextResponse.json({ chats });
}

export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");

  const parsed = await parseBody(req, createChatSchema);
  if (!parsed.ok) return parsed.response;

  const supabase = await supabaseServer();

  if (parsed.data.kind === "direct") {
    const { data, error } = await supabase.rpc("get_or_create_direct_chat", {
      p_other: parsed.data.otherUserId,
    });
    if (error) return jsonError(500, error.message);
    return NextResponse.json({ chatId: data });
  }

  // group
  const { name, memberIds } = parsed.data;
  const uniqueMembers = Array.from(new Set([session.id, ...memberIds]));

  const { data: chat, error: chatErr } = await supabase
    .from("chats")
    .insert({ type: "group", name, created_by: session.id })
    .select()
    .single();
  if (chatErr || !chat) return jsonError(500, chatErr?.message ?? "Failed");

  const rows = uniqueMembers.map((id) => ({
    chat_id: chat.id,
    user_id: id,
    role: id === session.id ? ("admin" as const) : ("member" as const),
  }));

  const { error: memErr } = await supabase.from("chat_members").insert(rows);
  if (memErr) {
    await supabase.from("chats").delete().eq("id", chat.id);
    return jsonError(500, memErr.message);
  }

  return NextResponse.json({ chatId: chat.id });
}
