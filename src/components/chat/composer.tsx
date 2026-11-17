"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, FileText, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useChatStore } from "@/store/chat-store";
import { useTypingBroadcast } from "@/hooks/use-typing-broadcast";
import { ATTACHMENT_MAX_BYTES, IMAGE_MIME_TYPES } from "@/lib/constants";
import { clientMessageId, cn, formatBytes } from "@/lib/utils";
import type { MessageWithSender, Profile } from "@/types/chat";

type StagedFile = {
  file: File;
  isImage: boolean;
  previewUrl?: string;
};

export function Composer({
  chatId,
  me,
  uploadsEnabled = true,
  maxLength = 4000,
}: {
  chatId: string;
  me: Profile;
  uploadsEnabled?: boolean;
  maxLength?: number;
}) {
  const [text, setText] = useState("");
  const [staged, setStaged] = useState<StagedFile | null>(null);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const appendMessage = useChatStore((s) => s.appendMessage);
  const replaceMessage = useChatStore((s) => s.replaceMessage);
  const removeMessage = useChatStore((s) => s.removeMessage);
  const bumpChatPreview = useChatStore((s) => s.bumpChatPreview);
  const notifyTyping = useTypingBroadcast(chatId, me);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [text]);

  useEffect(() => {
    return () => {
      if (staged?.previewUrl) URL.revokeObjectURL(staged.previewUrl);
    };
  }, [staged]);

  const onPickFile = useCallback(async (file: File) => {
    if (file.size > ATTACHMENT_MAX_BYTES) {
      toast.error(`File too large (max ${formatBytes(ATTACHMENT_MAX_BYTES)})`);
      return;
    }
    const isImage = IMAGE_MIME_TYPES.includes(file.type);

    let finalFile = file;
    if (isImage && file.size > 800 * 1024) {
      try {
        const { default: imageCompression } = await import("browser-image-compression");
        finalFile = await imageCompression(file, {
          maxSizeMB: 0.8,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
          fileType: file.type,
        });
      } catch {}
    }

    setStaged({
      file: finalFile,
      isImage,
      previewUrl: isImage ? URL.createObjectURL(finalFile) : undefined,
    });
  }, []);

  const onDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) await onPickFile(file);
    },
    [onPickFile],
  );

  async function uploadStaged(): Promise<{
    url: string;
    name: string;
    size: number;
    mime: string;
    isImage: boolean;
  } | null> {
    if (!staged) return null;
    const fd = new FormData();
    fd.append("file", staged.file, staged.file.name);
    fd.append("kind", "attachment");
    fd.append("chatId", chatId);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(body.error ?? "Upload failed");
      return null;
    }
    return (await res.json()) as {
      url: string;
      name: string;
      size: number;
      mime: string;
      isImage: boolean;
    };
  }

  async function onSend() {
    const trimmed = text.trim();
    if (!trimmed && !staged) return;
    if (sending) return;
    setSending(true);

    const tempId = clientMessageId();
    const now = new Date().toISOString();

    let attachment:
      | { url: string; name: string; size: number; mime: string; isImage: boolean }
      | null = null;

    try {
      if (staged) {
        attachment = await uploadStaged();
        if (!attachment) {
          setSending(false);
          return;
        }
      }

      const optimistic: MessageWithSender = {
        id: tempId,
        chat_id: chatId,
        sender_id: me.id,
        content: trimmed || null,
        type: attachment ? (attachment.isImage ? "image" : "file") : "text",
        attachment_url: attachment?.url ?? null,
        attachment_name: attachment?.name ?? null,
        attachment_size: attachment?.size ?? null,
        attachment_mime: attachment?.mime ?? null,
        reply_to: null,
        created_at: now,
        edited_at: null,
        deleted_at: null,
        sender: {
          id: me.id,
          username: me.username,
          display_name: me.display_name,
          avatar_url: me.avatar_url,
        },
      };
      appendMessage(chatId, optimistic);
      bumpChatPreview(chatId, optimistic, true);

      setText("");
      setStaged(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      const res = await fetch(`/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: trimmed || undefined,
          type: optimistic.type,
          attachmentUrl: attachment?.url,
          attachmentName: attachment?.name,
          attachmentSize: attachment?.size,
          attachmentMime: attachment?.mime,
        }),
      });

      if (!res.ok) {
        removeMessage(chatId, tempId);
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Couldn't send");
        return;
      }
      const body = (await res.json()) as { message: MessageWithSender };
      replaceMessage(chatId, tempId, body.message);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void onSend();
    }
  }

  const empty = !text.trim() && !staged;

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className="px-3 pt-1 sm:px-6"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="rounded-[1.75rem] border border-border/70 bg-card p-1.5 shadow-[0_10px_30px_-18px_rgb(15_18_30/0.45)] transition-shadow focus-within:ring-2 focus-within:ring-ring/40">
        {staged && (
          <div className="mb-1.5 flex items-center gap-3 rounded-[1.25rem] bg-muted p-2">
            {staged.isImage && staged.previewUrl ? (
              <img
                src={staged.previewUrl}
                alt="Preview of the image you are about to send"
                className="h-12 w-12 rounded-xl object-cover"
              />
            ) : (
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-card">
                <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{staged.file.name}</div>
              <div className="text-xs text-muted-foreground">{formatBytes(staged.file.size)}</div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setStaged(null)}
              aria-label="Remove attachment"
            >
              <X />
            </Button>
          </div>
        )}

        <div className="flex items-end gap-1">
          <input
            type="file"
            ref={fileInputRef}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPickFile(f);
            }}
          />
          {uploadsEnabled && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              aria-label="Attach a file"
              className="shrink-0 text-muted-foreground [&_svg]:size-5"
            >
              <Paperclip />
            </Button>
          )}
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              const v = e.target.value;
              setText(v.length > maxLength ? v.slice(0, maxLength) : v);
              notifyTyping();
            }}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={maxLength}
            placeholder="Type a message"
            aria-label="Message"
            enterKeyHint="send"
            className={cn(
              "max-h-40 flex-1 rounded-none border-0 bg-transparent py-2 shadow-none placeholder:text-muted-foreground focus-visible:ring-0 sm:text-[15px]",
              uploadsEnabled ? "px-1" : "pl-3 pr-1",
            )}
          />
          <Button
            type="button"
            size="icon"
            onClick={onSend}
            disabled={sending || empty}
            aria-label="Send"
            className="shrink-0 shadow-none [&_svg]:size-5"
          >
            {sending ? <Loader2 className="animate-spin" /> : <ArrowUp />}
          </Button>
        </div>
      </div>
    </div>
  );
}
