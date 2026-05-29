"use client";

import { useEffect, useMemo } from "react";
import { useParams, usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
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
  // On mobile we want the sidebar visible only on the empty /chats screen.
  // Once the user opens a chat, a settings page, or admin, hide it.
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

  return (
    <div className="flex h-screen-mobile overflow-hidden chat-bg">
      <aside
        className={cn(
          "w-full md:w-[340px] md:min-w-[300px] md:max-w-[380px] flex-shrink-0",
          "border-r border-border/60 bg-card/40 backdrop-blur",
          sidebarVisibleOnMobile ? "flex" : "hidden md:flex",
          "flex-col",
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
  );
}
