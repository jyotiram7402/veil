import { NextResponse, after } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getAuthUserId } from "@/lib/auth/session";
import { messageInputSchema } from "@/lib/validations";
import { clientKey, jsonError, parseBody, rateLimit } from "@/lib/api";
import { loadMessagesAfter, loadMessagesPage } from "@/lib/queries";
import { MESSAGE_PAGE_SIZE } from "@/lib/constants";
import { notifyNewMessage } from "@/lib/push";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const url = new URL(req.url);
  const before = url.searchParams.get("before") ?? undefined;
  const after = url.searchParams.get("after") ?? undefined;
  const limit = Math.min(
    Math.max(
      parseInt(url.searchParams.get("limit") ?? `${MESSAGE_PAGE_SIZE}`, 10) ||
        MESSAGE_PAGE_SIZE,
      1,
    ),
    100,
  );

  const supabase = await supabaseServer();
  const query = after
    ? loadMessagesAfter(supabase, id, after, 200)
    : loadMessagesPage(supabase, id, { before, limit });
  const [userId, messages] = await Promise.all([getAuthUserId(), query.catch(() => null)]);

  if (!userId) return jsonError(401, "Sign in required");
  if (!messages) return jsonError(500, "Something went wrong");
  if (after) return NextResponse.json({ messages, mode: "after" });
  return NextResponse.json({ messages, hasMore: messages.length === limit });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId();
  if (!userId) return jsonError(401, "Sign in required");
  const { id } = await ctx.params;

  if (!rateLimit(`msg:${userId}:${clientKey(req)}`, 60, 60_000)) {
    return jsonError(429, "Sending too fast");
  }

  const parsed = await parseBody(req, messageInputSchema);
  if (!parsed.ok) return parsed.response;

  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from("messages")
    .insert({
      chat_id: id,
      sender_id: userId,
      content: parsed.data.content ?? null,
      type: parsed.data.type,
      attachment_url: parsed.data.attachmentUrl ?? null,
      attachment_name: parsed.data.attachmentName ?? null,
      attachment_size: parsed.data.attachmentSize ?? null,
      attachment_mime: parsed.data.attachmentMime ?? null,
      reply_to: parsed.data.replyTo ?? null,
    })
    .select(
      `
        id, chat_id, sender_id, content, type,
        attachment_url, attachment_name, attachment_size, attachment_mime,
        reply_to, created_at, edited_at, deleted_at,
        sender:profiles(id, username, display_name, avatar_url)
      `,
    )
    .single();

  if (error) return jsonError(403, "Not allowed");

  const origin = new URL(req.url).origin;
  after(() => notifyNewMessage(id, userId, origin));
  return NextResponse.json({ message: data });
}
