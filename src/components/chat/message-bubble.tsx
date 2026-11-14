"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Check, CheckCheck, Download, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/chat/user-avatar";
import { ImageLightbox } from "@/components/chat/image-lightbox";
import { useChatStore } from "@/store/chat-store";
import { useLongPress } from "@/hooks/use-long-press";
import { timeShort } from "@/lib/format";
import { formatBytes, cn } from "@/lib/utils";
import type { MessageWithSender, Profile } from "@/types/chat";

type Props = {
  message: MessageWithSender;
  sender: Pick<Profile, "id" | "username" | "display_name" | "avatar_url"> | null;
  fromMe: boolean;
  /** Show the sender's name above the bubble (group chats, first of a run). */
  showSender: boolean;
  /** Keep a column for the sender's avatar (group chats). */
  showAvatar?: boolean;
  groupedTop: boolean;
  groupedBottom: boolean;
  readByOther?: boolean;
  /** When true, caller is an admin in this chat — they can delete anyone's message. */
  canDeleteAny?: boolean;
};

export function MessageBubble({
  message,
  sender,
  fromMe,
  showSender,
  showAvatar,
  groupedTop,
  groupedBottom,
  readByOther,
  canDeleteAny,
}: Props) {
  const [lightbox, setLightbox] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const removeMessage = useChatStore((s) => s.removeMessage);

  // Close menu on outside click / escape
  useEffect(() => {
    if (!menu) return;
    const onDown = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const isOptimistic = message.id.startsWith("local-");
  const canDelete = !isOptimistic && message.type !== "system" && (fromMe || canDeleteAny);

  const openMenu = useCallback(
    (x: number, y: number) => {
      if (!canDelete) return;
      setMenu({ x, y });
    },
    [canDelete],
  );

  const longPress = useLongPress(openMenu);

  const onDelete = useCallback(async () => {
    setMenu(null);
    // Optimistic remove
    removeMessage(message.chat_id, message.id);
    const res = await fetch(`/api/messages/${message.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(body.error ?? "Couldn't delete");
      // We don't roll back the optimistic remove — realtime DELETE will
      // re-sync or the user can refresh. Keeping it simple.
    }
  }, [message.chat_id, message.id, removeMessage]);

  // Call results and similar notes sit centred between the bubbles.
  if (message.type === "system") {
    return (
      <div className="my-3 flex justify-center px-4">
        <span className="rounded-full bg-card px-3 py-1 text-center text-xs text-muted-foreground shadow-sm">
          {message.content}
        </span>
      </div>
    );
  }

  // The last bubble of a run gets the time under it and one tighter corner.
  const lastOfRun = !groupedBottom;

  return (
    <div
      className={cn(
        "flex w-full items-end gap-2",
        fromMe ? "justify-end" : "justify-start",
        groupedTop ? "mt-0.5" : "mt-3",
      )}
    >
      {showAvatar && !fromMe && (
        <div className="w-8 shrink-0">
          {lastOfRun && sender && (
            <UserAvatar
              userId={sender.id}
              username={sender.username}
              displayName={sender.display_name}
              avatarUrl={sender.avatar_url}
              size="sm"
            />
          )}
        </div>
      )}

      <div
        className={cn(
          "flex min-w-0 max-w-[80%] flex-col sm:max-w-[64%]",
          fromMe ? "items-end" : "items-start",
        )}
      >
        {showSender && sender && (
          <span className="mb-1 ml-3 text-xs font-semibold text-muted-foreground">
            {sender.display_name ?? sender.username}
          </span>
        )}

        <div
          {...longPress}
          className={cn(
            "relative cursor-default overflow-hidden rounded-[1.25rem] text-[15px] leading-relaxed shadow-sm",
            fromMe
              ? "bg-bubble-out text-bubble-out-foreground"
              : "bg-bubble-in text-bubble-foreground",
            lastOfRun && (fromMe ? "rounded-br-md" : "rounded-bl-md"),
          )}
        >
          {message.type === "image" && message.attachment_url && (
            <button
              type="button"
              onClick={() => setLightbox(true)}
              aria-label={`Open image ${message.attachment_name ?? ""}`.trim()}
              className="block w-full max-w-[280px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <Image
                src={message.attachment_url}
                alt={message.attachment_name ?? "Image"}
                width={560}
                height={560}
                className="h-auto w-full object-cover"
                unoptimized
              />
            </button>
          )}

          {message.type === "file" && message.attachment_url && (
            <a
              href={message.attachment_url}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 transition-colors",
                fromMe ? "hover:bg-white/10" : "hover:bg-muted/60",
              )}
            >
              <span
                className={cn(
                  "grid h-10 w-10 shrink-0 place-items-center rounded-full",
                  fromMe ? "bg-white/20" : "bg-muted",
                )}
              >
                <FileText className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {message.attachment_name ?? "Attachment"}
                </div>
                {message.attachment_size != null && (
                  <div className="text-xs opacity-80">{formatBytes(message.attachment_size)}</div>
                )}
              </div>
              <Download className="h-4 w-4 shrink-0 opacity-80" aria-hidden="true" />
            </a>
          )}

          {message.content && (
            <p
              className={cn(
                "whitespace-pre-wrap break-words px-3.5 pb-2",
                // Text under a file row sits closer to it.
                message.type === "file" ? "pt-0.5" : "pt-2",
              )}
            >
              {message.content}
            </p>
          )}
        </div>

        {lastOfRun && (
          <span className="mt-1 flex select-none items-center gap-1 px-1.5 text-[11px] tabular-nums text-muted-foreground">
            {timeShort(message.created_at)}
            {fromMe &&
              (isOptimistic ? (
                <Check className="h-3.5 w-3.5 opacity-70" aria-label="Sending" />
              ) : readByOther ? (
                <CheckCheck className="h-3.5 w-3.5 text-tick" aria-label="Read" />
              ) : (
                <CheckCheck className="h-3.5 w-3.5 opacity-70" aria-label="Sent" />
              ))}
          </span>
        )}
      </div>

      {lightbox && message.attachment_url && (
        <ImageLightbox
          url={message.attachment_url}
          name={message.attachment_name ?? "Image"}
          onClose={() => setLightbox(false)}
        />
      )}

      {menu && canDelete && (
        <div
          className="fixed z-[70] min-w-[11rem] rounded-2xl border border-border/70 bg-card p-1 shadow-xl"
          style={{
            left: Math.min(menu.x, window.innerWidth - 190),
            top: Math.min(menu.y, window.innerHeight - 80),
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onDelete}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" /> Delete message
          </button>
        </div>
      )}
    </div>
  );
}
