"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/chat/user-avatar";
import { MessageList } from "@/components/chat/message-list";
import { Composer } from "@/components/chat/composer";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import { SessionLock } from "@/components/session-lock";
import { ThemeToggle } from "@/components/theme-toggle";
import { LiveIndicator } from "@/components/chat/live-indicator";
import { useChatRealtime } from "@/hooks/use-chat-realtime";
import { useResumeSync } from "@/hooks/use-resume-sync";
import { usePresence } from "@/hooks/use-presence";
import { useTypingPrune } from "@/hooks/use-typing-prune";
import { useChatStore } from "@/store/chat-store";
import { useSessionStore } from "@/store/session-store";
import { usePresenceStore } from "@/store/presence-store";
import { lastSeen } from "@/lib/format";
import type { SettingsShape } from "@/lib/settings";
import type { MessageWithSender, Profile } from "@/types/chat";

export function UserChat({
  me,
  adminProfile,
  chatId,
  initialMessages,
  initialHasMore,
  settings,
}: {
  me: Profile;
  adminProfile: Profile;
  chatId: string;
  initialMessages: MessageWithSender[];
  initialHasMore: boolean;
  settings: SettingsShape;
}) {
  const router = useRouter();
  const setInitial = useChatStore((s) => s.setInitialMessages);
  const setProfile = useSessionStore((s) => s.setProfile);

  useEffect(() => setProfile(me), [me, setProfile]);
  useEffect(() => {
    setInitial(chatId, initialMessages, initialHasMore);
  }, [chatId, initialMessages, initialHasMore, setInitial]);

  usePresence(me);
  useTypingPrune();

  const memberProfiles = useMemo(() => {
    const m: Record<string, Pick<Profile, "id" | "username" | "display_name" | "avatar_url">> = {};
    for (const p of [me, adminProfile]) {
      m[p.id] = {
        id: p.id,
        username: p.username,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
      };
    }
    return m;
  }, [me, adminProfile]);

  useChatRealtime({ chatId, me, memberProfiles });
  useResumeSync(chatId, me);

  const adminOnline = usePresenceStore((s) => s.online.has(adminProfile.id));
  const subtitle = adminOnline ? "online" : `last seen ${lastSeen(adminProfile.last_seen_at)}`;

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/expired");
  }

  const chat = (
    <div className="flex h-screen-mobile flex-col chat-bg">
      <header
        className="flex h-14 items-center gap-3 px-3 bg-header text-header-foreground"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <UserAvatar
          userId={adminProfile.id}
          username={adminProfile.username}
          displayName={adminProfile.display_name}
          avatarUrl={adminProfile.avatar_url}
          size="md"
          showPresence
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate flex items-center gap-2">
            {adminProfile.display_name ?? adminProfile.username}
            <LiveIndicator />
          </div>
          <div className="text-[11px] opacity-80 truncate">{subtitle}</div>
        </div>
        <ThemeToggle />
        <Button
          size="icon"
          variant="ghost"
          onClick={signOut}
          aria-label="Sign out"
          className="text-current hover:bg-white/10"
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </header>

      <MessageList chatId={chatId} me={me} memberProfiles={memberProfiles} />
      {settings.typing_indicator ? <TypingIndicator chatId={chatId} /> : <div className="h-5" />}
      <Composer
        chatId={chatId}
        me={me}
        uploadsEnabled={settings.uploads_enabled}
        maxLength={settings.max_message_length}
      />
    </div>
  );

  // The screen guard is now the SessionLock itself — opaque cover, password
  // to unlock. We keep the old screen_guard setting as a no-op kill-switch
  // (off = no lock at all, on = lock as designed).
  if (settings.screen_guard) {
    return <SessionLock me={me}>{chat}</SessionLock>;
  }
  return chat;
}
