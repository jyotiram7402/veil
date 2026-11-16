"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ImageIcon, Paperclip, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/chat/user-avatar";
import { useChatStore } from "@/store/chat-store";
import { usePresenceStore } from "@/store/presence-store";
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

function firstWord(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function Preview({ chat, meId }: { chat: ChatSummary; meId: string }) {
  const m = chat.last_message;
  if (!m) return <>No messages yet</>;
  if (m.type === "system") return <>{m.content ?? ""}</>;

  const mine = m.sender_id === meId;
  const icon = "mr-1 inline h-3.5 w-3.5 align-[-2px]";
  return (
    <>
      {mine && "You: "}
      {m.type === "image" && <ImageIcon className={icon} aria-hidden="true" />}
      {m.type === "file" && <Paperclip className={icon} aria-hidden="true" />}
      {m.type === "image"
        ? "Photo"
        : m.type === "file"
          ? "File"
          : (m.content ?? "").replace(/\s+/g, " ").trim()}
    </>
  );
}

export function ChatList({
  me,
  activeChatId,
  onNewChat,
}: {
  me: Profile;
  activeChatId?: string;
  onNewChat: () => void;
}) {
  const chats = useChatStore((s) => s.chats);
  const online = usePresenceStore((s) => s.online);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");

  const people = useMemo(() => {
    const list: { chatId: string; userId: string; name: string; avatarUrl: string | null }[] = [];
    for (const c of chats) {
      if (c.type !== "direct") continue;
      const d = chatDisplay(c, me.id);
      if (!d.otherUserId) continue;
      list.push({ chatId: c.id, userId: d.otherUserId, name: d.name, avatarUrl: d.avatarUrl });
    }
    return list.sort((a, b) => Number(online.has(b.userId)) - Number(online.has(a.userId)));
  }, [chats, me.id, online]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return chats;
    return chats.filter((c) => {
      const d = chatDisplay(c, me.id);
      return (
        d.name.toLowerCase().includes(term) ||
        c.members.some((m) => m.username.toLowerCase().includes(term))
      );
    });
  }, [chats, q, me.id]);

  function closeSearch() {
    setSearching(false);
    setQ("");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {searching ? (
        <div className="flex items-center gap-2 px-5 pb-4">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && closeSearch()}
              autoFocus
              type="search"
              enterKeyHint="search"
              placeholder="Search chats"
              aria-label="Search chats"
              className="h-12 rounded-full border-transparent bg-muted pl-11 pr-4 shadow-none placeholder:text-muted-foreground"
            />
          </div>
          <Button size="icon" variant="ghost" onClick={closeSearch} aria-label="Close search">
            <X className="h-5 w-5" />
          </Button>
        </div>
      ) : (
        <nav
          aria-label="People"
          className="no-scrollbar flex gap-4 overflow-x-auto px-5 pb-4"
        >
          <button
            type="button"
            onClick={() => setSearching(true)}
            className="group flex w-14 shrink-0 flex-col items-center gap-1.5 rounded-2xl focus-visible:outline-none"
          >
            <span className="grid h-14 w-14 place-items-center rounded-full bg-muted transition-colors group-hover:bg-accent group-focus-visible:ring-2 group-focus-visible:ring-ring">
              <Search className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-xs font-medium">Search</span>
          </button>

          {people.map((p) => (
            <Link
              key={p.chatId}
              href={`/chats/${p.chatId}`}
              className="group flex w-14 shrink-0 flex-col items-center gap-1.5 rounded-2xl focus-visible:outline-none"
            >
              <UserAvatar
                userId={p.userId}
                username={p.name}
                displayName={p.name}
                avatarUrl={p.avatarUrl}
                size="story"
                showPresence
                className="rounded-full group-focus-visible:ring-2 group-focus-visible:ring-ring"
              />
              <span className="w-full truncate text-center text-xs font-medium">
                {firstWord(p.name)}
              </span>
            </Link>
          ))}
        </nav>
      )}

      <div className="mx-5 h-px shrink-0 bg-border" />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4 pt-2">
        {chats.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-base font-bold">No chats yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Start a chat with one of your members.
            </p>
            <Button className="mt-5" onClick={onNewChat}>
              New chat
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-muted-foreground">
            No chat matches &ldquo;{q.trim()}&rdquo;.
          </p>
        ) : (
          <ul>
            {filtered.map((chat) => {
              const d = chatDisplay(chat, me.id);
              const active = chat.id === activeChatId;
              const unread = chat.unread_count > 0;
              return (
                <li key={chat.id}>
                  <Link
                    href={`/chats/${chat.id}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      active ? "bg-accent" : "hover:bg-muted/70 active:bg-muted",
                    )}
                  >
                    <UserAvatar
                      userId={chat.type === "direct" ? d.otherUserId : null}
                      username={d.name}
                      displayName={d.name}
                      avatarUrl={d.avatarUrl}
                      size="lg"
                      showPresence={chat.type === "direct"}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span
                          className={cn(
                            "truncate text-[15px]",
                            unread ? "font-bold" : "font-semibold",
                          )}
                        >
                          {d.name}
                        </span>
                        {chat.last_message && (
                          <span
                            className={cn(
                              "shrink-0 text-xs tabular-nums",
                              unread ? "font-semibold text-foreground" : "text-muted-foreground",
                            )}
                          >
                            {chatListTime(chat.last_message.created_at)}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-3">
                        <p
                          className={cn(
                            "truncate text-sm",
                            unread ? "font-medium text-foreground" : "text-muted-foreground",
                          )}
                        >
                          <Preview chat={chat} meId={me.id} />
                        </p>
                        {unread && (
                          <span
                            className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold tabular-nums text-primary-foreground"
                            aria-label={`${chat.unread_count} unread`}
                          >
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
      </div>
    </div>
  );
}
