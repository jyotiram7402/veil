"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { CallProvider } from "@/components/call/call-provider";
import { useSessionStore } from "@/store/session-store";
import { useChatStore } from "@/store/chat-store";
import { useChatListRealtime } from "@/hooks/use-chat-list-realtime";
import { usePresence } from "@/hooks/use-presence";
import { useHeartbeat } from "@/hooks/use-heartbeat";
import { useTypingPrune } from "@/hooks/use-typing-prune";
import type { ChatSummary, Profile } from "@/types/chat";
import { cn } from "@/lib/utils";

export function AppShell({
  me,
  initialChats,
  children,
}: {
  me: Profile;
  initialChats: ChatSummary[];
  children: React.ReactNode;
}) {
  const params = useParams<{ id?: string }>();
  const pathname = usePathname();
  const activeChatId = params?.id;
  const sidebarVisibleOnMobile = pathname === "/chats" || pathname === "/chats/";

  const setProfile = useSessionStore((s) => s.setProfile);
  const setChats = useChatStore((s) => s.setChats);
  const chats = useChatStore((s) => s.chats);

  useEffect(() => setProfile(me), [me, setProfile]);
  useEffect(() => setChats(initialChats), [initialChats, setChats]);

  usePresence(me);
  useHeartbeat(true);
  useTypingPrune();

  const refreshChats = useMemo(
    () => async () => {
      const res = await fetch("/api/chats", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { chats: ChatSummary[] };
      setChats(body.chats);
    },
    [setChats],
  );

  useChatListRealtime({
    me,
    knownChatIds: chats.map((c) => c.id),
    refreshChats,
  });

  const knownChats = chats.length > 0 ? chats : initialChats;
  const callChats = useMemo(
    () =>
      knownChats.flatMap((chat) => {
        if (chat.type !== "direct") return [];
        const other = chat.members.find((m) => m.id !== me.id);
        return other ? [{ chatId: chat.id, other }] : [];
      }),
    [knownChats, me.id],
  );
  const router = useRouter();
  const openChat = useCallback(
    (chatId: string) => {
      if (chatId !== activeChatId) router.push(`/chats/${chatId}`);
    },
    [router, activeChatId],
  );

  return (
    <CallProvider me={me} chats={callChats} onOpenChat={openChat}>
      <div className="flex h-screen-mobile overflow-hidden bg-background">
        <aside
          className={cn(
            "w-full flex-shrink-0 flex-col bg-card md:w-[380px] md:border-r md:border-border",
            sidebarVisibleOnMobile ? "flex" : "hidden md:flex",
          )}
        >
          <Sidebar me={me} activeChatId={activeChatId} />
        </aside>
        <main
          className={cn(
            "flex-1 flex flex-col min-w-0",
            sidebarVisibleOnMobile && "hidden md:flex",
          )}
        >
          {children}
        </main>
      </div>
    </CallProvider>
  );
}
