import { redirect } from "next/navigation";
import { getAuthUserId, requireSessionUser } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadMessagesPage } from "@/lib/queries";
import { MESSAGE_PAGE_SIZE } from "@/lib/constants";
import { effectiveSettingsForUser } from "@/lib/settings";
import { UserChat } from "@/components/user-chat";
import type { Profile } from "@/types/chat";

export const dynamic = "force-dynamic";

export default async function UserChatPage() {
  const userId = await getAuthUserId();
  if (!userId) redirect("/login");

  const supabase = await supabaseServer();
  const [session, membershipResult, settings] = await Promise.all([
    requireSessionUser(),
    Promise.resolve(
      supabase
        .from("chat_members")
        .select(
          `
        chat_id,
        chat:chats(
          id, type, name, avatar_url, created_at, updated_at,
          members:chat_members(
            last_read_at,
            user:profiles(id, username, display_name, avatar_url, last_seen_at, is_admin)
          )
        )
      `,
        )
        .eq("user_id", userId),
    ),
    effectiveSettingsForUser(userId),
  ]);

  if (session.profile.is_admin) redirect("/chats");

  if (session.profile.suspended || session.profile.archived) {
    redirect("/expired");
  }

  if (session.profile.is_room_guest) {
    const { data: roomMember } = await supabase
      .from("chat_members")
      .select("chat_id, chat:chats(id, type, status)")
      .eq("user_id", session.id)
      .limit(1)
      .maybeSingle();
    const room = (roomMember?.chat ?? null) as { id: string; type: string; status: string } | null;
    if (room && room.type === "room" && (room.status === "active" || room.status === "locked")) {
      redirect(`/room/${room.id}`);
    }
    redirect("/join");
  }

  const { data: memberships, error: mErr } = membershipResult;
  if (mErr) throw mErr;

  type R = {
    chat_id: string;
    chat: {
      id: string;
      type: "direct" | "group";
      name: string | null;
      avatar_url: string | null;
      created_at: string;
      updated_at: string;
      members: Array<{ last_read_at: string; user: Profile | null }> | null;
    } | null;
  };

  const rows = (memberships ?? []) as unknown as R[];
  const directWithAdmin = rows.find(
    (r) => r.chat?.type === "direct" &&
      (r.chat.members ?? []).some((m) => m.user?.is_admin),
  );

  let chatId: string | undefined = directWithAdmin?.chat?.id;
  const readers: Record<string, string> = Object.fromEntries(
    (directWithAdmin?.chat?.members ?? []).flatMap((m) =>
      m.user ? [[m.user.id, m.last_read_at]] : [],
    ),
  );
  let adminProfile: Profile | null = directWithAdmin
    ? (directWithAdmin.chat?.members ?? [])
        .map((m) => m.user)
        .find((u) => u?.is_admin) ?? null
    : null;

  if (!chatId) {
    const admin = supabaseAdmin();
    const { data: anyAdmin } = await admin
      .from("profiles")
      .select("*")
      .eq("is_admin", true)
      .limit(1)
      .maybeSingle();
    if (!anyAdmin) redirect("/expired");

    adminProfile = anyAdmin as Profile;

    const { data: newChat, error: chatErr } = await admin
      .from("chats")
      .insert({ type: "direct", created_by: anyAdmin.id })
      .select()
      .single();
    if (chatErr || !newChat) redirect("/expired");

    await admin.from("chat_members").insert([
      { chat_id: newChat.id, user_id: anyAdmin.id, role: "admin" as const },
      { chat_id: newChat.id, user_id: session.id, role: "member" as const },
    ]);
    chatId = newChat.id;
  }

  const initialMessages = await loadMessagesPage(supabase, chatId!, { limit: MESSAGE_PAGE_SIZE });

  return (
    <UserChat
      me={session.profile}
      adminProfile={adminProfile!}
      chatId={chatId!}
      initialMessages={initialMessages}
      initialHasMore={initialMessages.length === MESSAGE_PAGE_SIZE}
      readers={readers}
      settings={settings}
    />
  );
}
