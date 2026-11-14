"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DoorOpen, LogOut, MessageSquarePlus, Settings, Shield, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme-toggle";
import { ChatList } from "@/components/chat/chat-list";
import { NewChatDialog } from "@/components/chat/new-chat-dialog";
import { UserAvatar } from "@/components/chat/user-avatar";
import { useSessionStore } from "@/store/session-store";
import { APP_NAME } from "@/lib/constants";
import type { Profile } from "@/types/chat";

export function Sidebar({ me, activeChatId }: { me: Profile; activeChatId?: string }) {
  const router = useRouter();
  const profile = useSessionStore((s) => s.profile) ?? me;
  const [newChatOpen, setNewChatOpen] = useState(false);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <header className="flex items-center justify-between px-4 h-14 border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 min-w-0 group">
                <UserAvatar
                  userId={profile.id}
                  username={profile.username}
                  displayName={profile.display_name}
                  avatarUrl={profile.avatar_url}
                  size="sm"
                />
                <div className="hidden sm:block text-left truncate">
                  <div className="text-sm font-medium leading-tight truncate">
                    {profile.display_name ?? profile.username}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    @{profile.username}
                  </div>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>{APP_NAME}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/settings")}>
                <Settings className="h-4 w-4" /> Settings
              </DropdownMenuItem>
              {profile.is_admin && (
                <DropdownMenuItem onClick={() => router.push("/admin")}>
                  <Shield className="h-4 w-4" /> Members
                </DropdownMenuItem>
              )}
              {profile.is_admin && (
                <DropdownMenuItem onClick={() => router.push("/rooms")}>
                  <DoorOpen className="h-4 w-4" /> Rooms
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive">
                <LogOut className="h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setNewChatOpen(true)}
                aria-label="New chat"
              >
                <MessageSquarePlus className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New chat</TooltipContent>
          </Tooltip>

          {profile.is_admin && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" asChild aria-label="Members">
                  <Link href="/admin">
                    <Users className="h-5 w-5" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Members</TooltipContent>
            </Tooltip>
          )}

          {profile.is_admin && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" asChild aria-label="Rooms">
                  <Link href="/rooms">
                    <DoorOpen className="h-5 w-5" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Rooms</TooltipContent>
            </Tooltip>
          )}
        </div>
      </header>

      <ChatList me={profile} activeChatId={activeChatId} />

      <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} />
    </>
  );
}
