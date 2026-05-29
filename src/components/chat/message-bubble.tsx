"use client";

import { useState } from "react";
import Image from "next/image";
import { Download, FileText } from "lucide-react";
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
};

export function MessageBubble({
  message,
  sender,
  fromMe,
  showSender,
  groupedTop,
  groupedBottom,
}: Props) {
  const [lightbox, setLightbox] = useState(false);

  if (message.type === "system") {
    return (
      <div className="my-2 flex justify-center">
        <span className="text-[11px] text-muted-foreground italic">{message.content}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex w-full items-end gap-2",
        fromMe ? "justify-end" : "justify-start",
        groupedTop ? "mt-0.5" : "mt-2",
      )}
    >
      {!fromMe && (
        <div className={cn("w-8 shrink-0", groupedBottom && "invisible")}>
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

      <div className={cn("flex flex-col max-w-[78%] sm:max-w-[68%]", fromMe ? "items-end" : "items-start")}>
        {showSender && sender && (
          <span className="mb-0.5 ml-1 text-[11px] font-medium text-muted-foreground">
            {sender.display_name ?? sender.username}
          </span>
        )}

        <div
          className={cn(
            "relative px-3 py-2 text-sm shadow-sm",
            fromMe
              ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md"
              : "bg-card border border-border/60 rounded-2xl rounded-bl-md",
            groupedTop && fromMe && "rounded-tr-md",
            groupedTop && !fromMe && "rounded-tl-md",
          )}
        >
          {message.type === "image" && message.attachment_url && (
            <button
              type="button"
              onClick={() => setLightbox(true)}
              className="block mb-1 overflow-hidden rounded-lg max-w-[280px]"
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
                "mb-1 flex items-center gap-2 rounded-lg border px-3 py-2",
                fromMe
                  ? "border-white/20 bg-white/10 hover:bg-white/15"
                  : "border-border/60 bg-background/40 hover:bg-background/60",
              )}
            >
              <FileText className="h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">
                  {message.attachment_name ?? "Attachment"}
                </div>
                {message.attachment_size != null && (
                  <div className={cn("text-[11px]", fromMe ? "text-white/70" : "text-muted-foreground")}>
                    {formatBytes(message.attachment_size)}
                  </div>
                )}
              </div>
              <Download className="h-4 w-4 opacity-70" />
            </a>
          )}

          {message.content && (
            <p className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
          )}

          <span
            className={cn(
              "ml-2 align-middle text-[10px] tabular-nums select-none",
              fromMe ? "text-white/70" : "text-muted-foreground",
              "float-right pl-2 pt-1",
            )}
          >
            {timeShort(message.created_at)}
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
