"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Moon, MoreHorizontal, Smile, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/chat/user-avatar";
import { MessageList } from "@/components/chat/message-list";
import { Composer } from "@/components/chat/composer";
import { SessionLock } from "@/components/session-lock";
import { MojiPicker } from "@/components/moji-picker";
import { useTheme } from "@/components/theme-toggle";
import { CallProvider } from "@/components/call/call-provider";
import { CallButton } from "@/components/call/call-button";
import { LiveIndicator } from "@/components/chat/live-indicator";
import { useChatRealtime } from "@/hooks/use-chat-realtime";
import { useResumeSync } from "@/hooks/use-resume-sync";
import { usePresence } from "@/hooks/use-presence";
import { useTypingPrune } from "@/hooks/use-typing-prune";
import { useChatStore } from "@/store/chat-store";
import { useSessionStore } from "@/store/session-store";
import { usePresenceStore } from "@/store/presence-store";
import { lastSeen } from "@/lib/format";
import { cn } from "@/lib/utils";
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

  const callChats = useMemo(() => [{ chatId, other: adminProfile }], [chatId, adminProfile]);

  const adminOnline = usePresenceStore((s) => s.online.has(adminProfile.id));
  const subtitle = adminOnline ? "Online" : `Last seen ${lastSeen(adminProfile.last_seen_at)}`;
  const { theme, toggle: toggleTheme } = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  // The store has the freshest copy of my own profile (it changes when I pick an avatar).
  const myProfile = useSessionStore((s) => s.profile) ?? me;

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/expired");
  }

  const chat = (
    <div className="flex h-screen-mobile flex-col chat-bg">
      {/* The page body already keeps clear of the notch (see globals.css). */}
      <header className="flex h-16 shrink-0 items-center gap-1 border-b border-border/70 bg-header pl-3 pr-2 text-header-foreground sm:px-4">
        <UserAvatar
          userId={adminProfile.id}
          username={adminProfile.username}
          displayName={adminProfile.display_name}
          avatarUrl={adminProfile.avatar_url}
          size="md"
          showPresence
        />
        <div className="ml-2 min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[15px] font-bold leading-tight">
            <span className="truncate">{adminProfile.display_name ?? adminProfile.username}</span>
            <LiveIndicator />
          </div>
          <div
            className={cn(
              "truncate text-xs",
              adminOnline ? "font-medium text-online-ink" : "text-muted-foreground",
            )}
          >
            {subtitle}
          </div>
        </div>
        <CallButton chatId={chatId} mode="video" className="[&_svg]:size-5" />
        <CallButton chatId={chatId} mode="voice" className="[&_svg]:size-5" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" aria-label="More" className="[&_svg]:size-5">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem className="px-3 py-2.5" onClick={() => setPickerOpen(true)}>
              <Smile className="h-4 w-4" /> Change avatar
            </DropdownMenuItem>
            <DropdownMenuItem className="px-3 py-2.5" onClick={toggleTheme}>
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </DropdownMenuItem>
            <DropdownMenuItem className="px-3 py-2.5 text-destructive" onClick={signOut}>
              <LogOut className="h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <MessageList
        chatId={chatId}
        me={me}
        memberProfiles={memberProfiles}
        showTyping={settings.typing_indicator}
      />
      <Composer
        chatId={chatId}
        me={me}
        uploadsEnabled={settings.uploads_enabled}
        maxLength={settings.max_message_length}
      />

      <MojiPicker open={pickerOpen} onOpenChange={setPickerOpen} profile={myProfile} />
    </div>
  );

  // The screen guard is now the SessionLock itself — opaque cover, password
  // to unlock. We keep the old screen_guard setting as a no-op kill-switch
  // (off = no lock at all, on = lock as designed).
  // CallProvider wraps everything so the WebRTC signaling channel + call
  // screen live for the whole time the app is open. A member has one chat to
  // be called in: this one, with the admin.
  const inner = settings.screen_guard ? <SessionLock me={me}>{chat}</SessionLock> : chat;
  return (
    <CallProvider me={me} chats={callChats}>
      {inner}
    </CallProvider>
  );
}
