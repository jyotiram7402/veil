"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserAvatar } from "@/components/chat/user-avatar";
import { useChatStore } from "@/store/chat-store";
import { chatListTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ChatSummary, Profile } from "@/types/chat";

function chatDisplay(chat: ChatSummary, meId: string) {
  if (chat.type === "group") {
    return {
      name: chat.name ?? "Untitled group",
      avatarUrl: chat.avatar_url,
      otherUserId: null as string | null,
    };
  }
  const other = chat.members.find((m) => m.id !== meId) ?? chat.members[0];
  return {
    name: other?.display_name ?? other?.username ?? "Unknown",
    avatarUrl: other?.avatar_url ?? null,
    otherUserId: other?.id ?? null,
  };
}

function previewText(chat: ChatSummary): string {
  const m = chat.last_message;
  if (!m) return "Say hi 👋";
  if (m.type === "image") return "📷 Photo";
  if (m.type === "file") return "📎 File";
  if (m.type === "system") return m.content ?? "";
  return (m.content ?? "").replace(/\s+/g, " ").trim();
}

export function ChatList({ me, activeChatId }: { me: Profile; activeChatId?: string }) {
  const chats = useChatStore((s) => s.chats);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!q.trim()) return chats;
    const term = q.trim().toLowerCase();
    return chats.filter((c) => {
      const d = chatDisplay(c, me.id);
      return (
        d.name.toLowerCase().includes(term) ||
        c.members.some((m) => m.username.toLowerCase().includes(term))
      );
    });
  }, [chats, q, me.id]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-3 py-3">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chats"
            className="pl-9 h-9 bg-background/40"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 px-2">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8 px-4">
            {chats.length === 0
              ? "No chats yet. Start one from the top right."
              : "No matches."}
          </p>
        ) : (
          <ul className="pb-3 space-y-0.5">
            {filtered.map((chat) => {
              const d = chatDisplay(chat, me.id);
              const active = chat.id === activeChatId;
              return (
                <li key={chat.id}>
                  <Link
                    href={`/chats/${chat.id}`}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition-colors",
                      active
                        ? "bg-primary/15 hover:bg-primary/15"
                        : "hover:bg-accent/60",
                    )}
                  >
                    <UserAvatar
                      userId={chat.type === "direct" ? d.otherUserId : null}
                      username={d.name}
                      displayName={d.name}
                      avatarUrl={d.avatarUrl}
                      size="md"
                      showPresence={chat.type === "direct"}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium truncate">{d.name}</span>
                        {chat.last_message && (
                          <span className="text-[11px] text-muted-foreground shrink-0">
                            {chatListTime(chat.last_message.created_at)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground truncate">
                          {previewText(chat)}
                        </p>
                        {chat.unread_count > 0 && (
                          <span className="ml-2 shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                            {chat.unread_count > 99 ? "99+" : chat.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
