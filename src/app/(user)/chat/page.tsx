import { redirect } from "next/navigation";
import { requireSessionUser } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadMessagesPage } from "@/lib/queries";
import { MESSAGE_PAGE_SIZE } from "@/lib/constants";
import { effectiveSettingsForUser } from "@/lib/settings";
import { UserChat } from "@/components/user-chat";
import type { Profile } from "@/types/chat";

export const dynamic = "force-dynamic";

export default async function UserChatPage() {
  const session = await requireSessionUser();

  // Admins should never land here
  if (session.profile.is_admin) redirect("/chats");

  // Suspended / archived users get bounced
  if (session.profile.suspended || session.profile.archived) {
    redirect("/expired");
  }

  const supabase = await supabaseServer();
  const admin = supabaseAdmin();

  // Find the one admin profile so we can locate the shared chat. There may be
  // multiple admins in theory; the user's chat is with whichever admin
  // created them. We find their existing direct chat.
  const { data: memberships, error: mErr } = await supabase
    .from("chat_members")
    .select(
      `
        chat_id,
        chat:chats(
          id, type, name, avatar_url, created_at, updated_at,
          members:chat_members(
            user:profiles(id, username, display_name, avatar_url, last_seen_at, is_admin)
          )
        )
      `,
    )
    .eq("user_id", session.id);

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
      members: Array<{ user: Profile | null }> | null;
    } | null;
  };

  const rows = (memberships ?? []) as unknown as R[];
  const directWithAdmin = rows.find(
    (r) => r.chat?.type === "direct" &&
      (r.chat.members ?? []).some((m) => m.user?.is_admin),
  );

  // If the admin hasn't started a chat with this user yet, create a placeholder
  // chat using the admin client (bypasses RLS). We pick any admin user to be
  // the counterparty.
  let chatId: string | undefined = directWithAdmin?.chat?.id;
  let adminProfile: Profile | null = directWithAdmin
    ? (directWithAdmin.chat?.members ?? [])
        .map((m) => m.user)
        .find((u) => u?.is_admin) ?? null
    : null;

  if (!chatId) {
    const { data: anyAdmin } = await admin
      .from("profiles")
      .select("*")
      .eq("is_admin", true)
      .limit(1)
      .maybeSingle();
    if (!anyAdmin) redirect("/expired"); // nobody to talk to

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

  const initialMessages = await loadMessagesPage(supabase, chatId!, {
    limit: MESSAGE_PAGE_SIZE,
  });

  await supabase
    .from("chat_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("chat_id", chatId!)
    .eq("user_id", session.id);

  const settings = await effectiveSettingsForUser(session.id);

  return (
    <UserChat
      me={session.profile}
      adminProfile={adminProfile!}
      chatId={chatId!}
      initialMessages={initialMessages}
      initialHasMore={initialMessages.length === MESSAGE_PAGE_SIZE}
      settings={settings}
    />
  );
}
