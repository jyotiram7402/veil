"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, CheckCheck, Download, FileText } from "lucide-react";
import { UserAvatar } from "@/components/chat/user-avatar";
import { ImageLightbox } from "@/components/chat/image-lightbox";
import { timeShort } from "@/lib/format";
import { formatBytes, cn } from "@/lib/utils";
import type { MessageWithSender, Profile } from "@/types/chat";

type Props = {
  message: MessageWithSender;
  sender: Pick<Profile, "id" | "username" | "display_name" | "avatar_url"> | null;
  fromMe: boolean;
  showSender: boolean;
  groupedTop: boolean;
  groupedBottom: boolean;
  /** Whether this outgoing message is considered "read" by the other side. */
  readByOther?: boolean;
};

export function MessageBubble({
  message,
  sender,
  fromMe,
  showSender,
  groupedTop,
  groupedBottom,
  readByOther,
}: Props) {
  const [lightbox, setLightbox] = useState(false);

  if (message.type === "system") {
    return (
      <div className="my-3 flex justify-center">
        <span className="rounded-full bg-card/90 px-3 py-1 text-[11px] text-muted-foreground shadow-sm">
          {message.content}
        </span>
      </div>
    );
  }

  const isOptimistic = message.id.startsWith("local-");
  const showTopTail = !groupedTop;

  return (
    <div
      className={cn(
        "group flex w-full items-end gap-2 px-1",
        fromMe ? "justify-end" : "justify-start",
        groupedTop ? "mt-0.5" : "mt-2",
      )}
    >
      {!fromMe && (
        <div className={cn("w-7 shrink-0", groupedBottom && "invisible")}>
          {!groupedBottom && sender && (
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
          "flex flex-col max-w-[80%] sm:max-w-[64%]",
          fromMe ? "items-end" : "items-start",
        )}
      >
        {showSender && sender && (
          <span className="mb-0.5 ml-2 text-[11px] font-medium text-primary">
            {sender.display_name ?? sender.username}
          </span>
        )}

        <div
          className={cn(
            "relative px-2.5 py-1.5 text-sm shadow-sm rounded-lg",
            fromMe
              ? "bg-bubble-out text-bubble-foreground rounded-tr-md"
              : "bg-bubble-in text-bubble-foreground rounded-tl-md",
            showTopTail && (fromMe ? "rounded-tr-none" : "rounded-tl-none"),
          )}
        >
          {showTopTail && (
            <span aria-hidden className={fromMe ? "bubble-tail-out" : "bubble-tail-in"} />
          )}

          {message.type === "image" && message.attachment_url && (
            <button
              type="button"
              onClick={() => setLightbox(true)}
              className="block mb-1 overflow-hidden rounded-md max-w-[280px]"
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
              className="mb-1 flex items-center gap-2 rounded-md border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 px-3 py-2"
            >
              <FileText className="h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">
                  {message.attachment_name ?? "Attachment"}
                </div>
                {message.attachment_size != null && (
                  <div className="text-[11px] text-bubble-meta">
                    {formatBytes(message.attachment_size)}
                  </div>
                )}
              </div>
              <Download className="h-4 w-4 opacity-70" />
            </a>
          )}

          {message.content && (
            <p className="whitespace-pre-wrap break-words leading-relaxed pr-12">
              {message.content}
            </p>
          )}

          <span className="absolute bottom-1 right-2 flex items-center gap-0.5 text-[10px] tabular-nums text-bubble-meta select-none">
            {timeShort(message.created_at)}
            {fromMe &&
              (isOptimistic ? (
                <Check className="h-3 w-3 opacity-60" />
              ) : readByOther ? (
                <CheckCheck className="h-3 w-3 text-tick" />
              ) : (
                <CheckCheck className="h-3 w-3 opacity-70" />
              ))}
          </span>
        </div>
      </div>

      {lightbox && message.attachment_url && (
        <ImageLightbox
          url={message.attachment_url}
          name={message.attachment_name ?? "Image"}
          onClose={() => setLightbox(false)}
        />
      )}
    </div>
  );
}
