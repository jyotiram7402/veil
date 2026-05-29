import { notFound } from "next/navigation";
import { requireSessionUser } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";
import { loadMessagesPage } from "@/lib/queries";
import { MESSAGE_PAGE_SIZE } from "@/lib/constants";
import { ChatThread } from "@/components/chat/chat-thread";
import type { Profile } from "@/types/chat";

export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSessionUser();
  const supabase = await supabaseServer();

  const { data: chat, error } = await supabase
    .from("chats")
    .select(
      `
        id, type, name, avatar_url, created_by, created_at, updated_at,
        members:chat_members(
          role, joined_at, last_read_at,
          user:profiles(id, username, display_name, avatar_url, last_seen_at, bio)
        )
      `,
    )
    .eq("id", id)
    .single();

  if (error || !chat) notFound();

  const initialMessages = await loadMessagesPage(supabase, id, { limit: MESSAGE_PAGE_SIZE });

  // mark as read for the opening user
  await supabase
    .from("chat_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("chat_id", id)
    .eq("user_id", session.id);

  const members = (chat.members ?? [])
    .map((m) => m.user)
    .filter((u): u is Profile => !!u);

  return (
    <ChatThread
      me={session.profile}
      chatId={chat.id}
      chatType={chat.type}
      chatName={chat.name}
      chatAvatarUrl={chat.avatar_url}
      members={members}
      initialMessages={initialMessages}
      initialHasMore={initialMessages.length === MESSAGE_PAGE_SIZE}
    />
  );
}
