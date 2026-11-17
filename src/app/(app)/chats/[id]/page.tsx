import { notFound } from "next/navigation";
import { getAuthUserId, requireSessionUser } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";
import { loadMessagesPage } from "@/lib/queries";
import { MESSAGE_PAGE_SIZE } from "@/lib/constants";
import { memberHasDisappearing } from "@/lib/vanish";
import { ChatThread } from "@/components/chat/chat-thread";
import type { Profile } from "@/types/chat";

export const dynamic = "force-dynamic";

type MemberRow = { user: Pick<Profile, "id" | "is_admin"> | null };

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();

  const chatQuery = Promise.resolve(
    supabase
      .from("chats")
      .select(
        `
        id, type, name, avatar_url, created_by, created_at, updated_at,
        members:chat_members(
          role, joined_at, last_read_at,
          user:profiles(id, username, display_name, avatar_url, last_seen_at, bio, is_admin)
        )
      `,
      )
      .eq("id", id)
      .single(),
  );

  const disappearingQuery = chatQuery
    .then(({ data }) => {
      if (!data || data.type !== "direct") return false;
      const member = ((data.members ?? []) as unknown as MemberRow[])
        .map((m) => m.user)
        .find((u) => u && !u.is_admin);
      return member ? memberHasDisappearing(member.id) : false;
    })
    .catch(() => false);

  const messagesQuery = loadMessagesPage(supabase, id, { limit: MESSAGE_PAGE_SIZE }).catch(
    () => null,
  );

  const markRead = getAuthUserId().then((userId) =>
    userId
      ? supabase
          .from("chat_members")
          .update({ last_read_at: new Date().toISOString() })
          .eq("chat_id", id)
          .eq("user_id", userId)
          .then(() => undefined)
      : undefined,
  );

  const [session, { data: chat, error }, initialMessages, disappearing] = await Promise.all([
    requireSessionUser(),
    chatQuery,
    messagesQuery,
    disappearingQuery,
    markRead,
  ]);

  if (error || !chat) notFound();
  if (!initialMessages) throw new Error("Could not load the messages");

  const members = (chat.members ?? [])
    .map((m) => m.user)
    .filter((u): u is Profile => !!u);
  const readers = Object.fromEntries(
    (chat.members ?? []).flatMap((m) => (m.user ? [[m.user.id, m.last_read_at]] : [])),
  );

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
      readers={readers}
      disappearing={disappearing}
    />
  );
}
