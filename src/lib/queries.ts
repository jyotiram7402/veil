import "server-only";
import type { supabaseServer } from "@/lib/supabase/server";
import type { ChatSummary, MessageWithSender, Profile } from "@/types/chat";

// Derive the client type from the factory itself so we stay aligned with
// whatever generics supabase-js currently uses (the 3-generic shape in 2.x).
type SB = Awaited<ReturnType<typeof supabaseServer>>;

type ChatListRow = {
  last_read_at: string;
  chat: {
    id: string;
    type: "direct" | "group";
    name: string | null;
    avatar_url: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
    members: Array<{
      user: Pick<Profile, "id" | "username" | "display_name" | "avatar_url"> | null;
    }> | null;
  } | null;
};

type LastMessageLite = {
  id: string;
  chat_id: string;
  sender_id: string | null;
  content: string | null;
  type: "text" | "image" | "file" | "system";
  created_at: string;
};

/**
 * Build the chat list for a user, with members, latest message, and unread
 * count. Done in two queries instead of a single deep embed so we can put
 * proper limits on the message scan.
 */
export async function loadChatsForUser(supabase: SB, userId: string): Promise<ChatSummary[]> {
  const { data: memberData, error } = await supabase
    .from("chat_members")
    .select(
      `
        last_read_at,
        chat:chats(
          id, type, name, avatar_url, created_by, created_at, updated_at,
          members:chat_members(
            user:profiles(id, username, display_name, avatar_url)
          )
        )
      `,
    )
    .eq("user_id", userId);

  if (error) throw error;
  const rows = (memberData ?? []) as unknown as ChatListRow[];
  if (rows.length === 0) return [];

  const chatIds = rows.map((r) => r.chat?.id).filter((x): x is string => !!x);

  // Latest message per chat. We pull a bounded recent window (250) and pick
  // the newest one for each chat; for a small private app this is fine and
  // avoids per-chat round trips.
  const lastByChat = new Map<string, LastMessageLite>();
  const unreadByChat = new Map<string, number>();

  if (chatIds.length > 0) {
    const { data: recent } = await supabase
      .from("messages")
      .select("id, chat_id, sender_id, content, type, created_at")
      .in("chat_id", chatIds)
      .order("created_at", { ascending: false })
      .limit(250);

    const lastReadByChat = new Map<string, string>();
    for (const r of rows) {
      if (r.chat?.id) lastReadByChat.set(r.chat.id, r.last_read_at);
    }

    for (const m of (recent ?? []) as LastMessageLite[]) {
      if (!lastByChat.has(m.chat_id)) lastByChat.set(m.chat_id, m);
      if (m.sender_id && m.sender_id !== userId) {
        const lr = lastReadByChat.get(m.chat_id);
        if (lr && new Date(m.created_at) > new Date(lr)) {
          unreadByChat.set(m.chat_id, (unreadByChat.get(m.chat_id) ?? 0) + 1);
        }
      }
    }
  }

  const summaries = rows
    .filter((r): r is ChatListRow & { chat: NonNullable<ChatListRow["chat"]> } => !!r.chat)
    .map((r) => {
      const chat = r.chat;
      const members = (chat.members ?? [])
        .map((m) => m.user)
        .filter((u): u is NonNullable<typeof u> => !!u);
      const last = lastByChat.get(chat.id) ?? null;
      return {
        id: chat.id,
        type: chat.type,
        name: chat.name,
        avatar_url: chat.avatar_url,
        created_by: chat.created_by,
        created_at: chat.created_at,
        updated_at: last?.created_at ?? chat.updated_at,
        members,
        last_message: last
          ? {
              id: last.id,
              content: last.content,
              type: last.type,
              created_at: last.created_at,
              sender_id: last.sender_id,
            }
          : null,
        my_last_read_at: r.last_read_at,
        unread_count: unreadByChat.get(chat.id) ?? 0,
      } satisfies ChatSummary;
    });

  summaries.sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );
  return summaries;
}

export async function loadMessagesPage(
  supabase: SB,
  chatId: string,
  opts: { before?: string; limit: number },
): Promise<MessageWithSender[]> {
  let q = supabase
    .from("messages")
    .select(
      `
        id, chat_id, sender_id, content, type,
        attachment_url, attachment_name, attachment_size, attachment_mime,
        reply_to, created_at, edited_at, deleted_at,
        sender:profiles(id, username, display_name, avatar_url)
      `,
    )
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .limit(opts.limit);

  if (opts.before) q = q.lt("created_at", opts.before);

  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as MessageWithSender[]).reverse();
}
