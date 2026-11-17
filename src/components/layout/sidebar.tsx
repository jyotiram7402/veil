"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, MessageSquarePlus, Moon, Settings, Sun, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChatList } from "@/components/chat/chat-list";
import { NewChatDialog } from "@/components/chat/new-chat-dialog";
import { UserAvatar } from "@/components/chat/user-avatar";
import { NotificationsMenuItem, NotificationsPrompt } from "@/components/notifications";
import { useTheme } from "@/components/theme-toggle";
import { forgetPushDevice } from "@/lib/push-client";
import { useChatStore } from "@/store/chat-store";
import { useSessionStore } from "@/store/session-store";
import type { Profile } from "@/types/chat";

export function Sidebar({ me, activeChatId }: { me: Profile; activeChatId?: string }) {
  const router = useRouter();
  const profile = useSessionStore((s) => s.profile) ?? me;
  const unread = useChatStore((s) => s.chats.reduce((n, c) => n + c.unread_count, 0));
  const { theme, toggle: toggleTheme } = useTheme();
  const [newChatOpen, setNewChatOpen] = useState(false);

  const name = profile.display_name ?? profile.username;
  const firstName = name.trim().split(/\s+/)[0] || name;

  async function signOut() {
    await forgetPushDevice();
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <header className="flex items-start justify-between gap-3 px-5 pb-4 pt-5">
        <div className="min-w-0">
          <h1 className="truncate text-[1.625rem] font-extrabold leading-tight tracking-tight">
            Hello, {firstName}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground" aria-live="polite">
            {unread > 0
              ? `${unread} unread ${unread === 1 ? "message" : "messages"}`
              : "You're all caught up"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="icon"
            variant="secondary"
            onClick={() => setNewChatOpen(true)}
            aria-label="New chat"
            className="shadow-none [&_svg]:size-5"
          >
            <MessageSquarePlus />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Your account"
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              >
                <UserAvatar
                  userId={profile.id}
                  username={profile.username}
                  displayName={profile.display_name}
                  avatarUrl={profile.avatar_url}
                  size="md"
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="px-3 py-2">
                <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
                <span className="block truncate">@{profile.username}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {profile.is_admin && (
                <DropdownMenuItem className="px-3 py-2.5" onClick={() => router.push("/admin")}>
                  <Users className="h-4 w-4" /> Members
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="px-3 py-2.5" onClick={() => router.push("/settings")}>
                <Settings className="h-4 w-4" /> Settings
              </DropdownMenuItem>
              <DropdownMenuItem className="px-3 py-2.5" onClick={toggleTheme}>
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </DropdownMenuItem>
              <NotificationsMenuItem />
              <DropdownMenuSeparator />
              <DropdownMenuItem className="px-3 py-2.5 text-destructive" onClick={signOut}>
                <LogOut className="h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <ChatList
          me={profile}
          activeChatId={activeChatId}
          onNewChat={() => setNewChatOpen(true)}
        />
        <NotificationsPrompt place="bottom" />
      </div>

      <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} />
    </>
  );
}
