"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Paperclip, SendHorizonal, Loader2, X, ImageIcon, FileText } from "lucide-react";
import imageCompression from "browser-image-compression";
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

export function Composer({ chatId, me }: { chatId: string; me: Profile }) {
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

  // auto-grow textarea
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
        finalFile = await imageCompression(file, {
          maxSizeMB: 0.8,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
          fileType: file.type,
        });
      } catch {
        // fall back to original
      }
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

      // clear UI immediately
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

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className="border-t border-border/60 bg-card/40 backdrop-blur px-3 py-3 sm:px-6"
    >
      {staged && (
        <div className="mb-2 flex items-center gap-3 rounded-xl border border-border/60 bg-background/60 p-2">
          {staged.isImage && staged.previewUrl ? (
            // next/image can't optimize a blob: URL — this is a tiny local
            // preview only, so a plain img is the right call.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={staged.previewUrl}
              alt="preview"
              className="h-12 w-12 rounded-md object-cover"
            />
          ) : (
            <div className="grid h-12 w-12 place-items-center rounded-md bg-muted">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="truncate text-sm">{staged.file.name}</div>
            <div className="text-xs text-muted-foreground">{formatBytes(staged.file.size)}</div>
          </div>
          <Button size="icon" variant="ghost" onClick={() => setStaged(null)} aria-label="Remove">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          type="file"
          ref={fileInputRef}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onPickFile(f);
          }}
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending}
          aria-label="Attach"
        >
          <Paperclip className="h-5 w-5" />
        </Button>
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            notifyTyping();
          }}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Type a message"
          className="flex-1 max-h-40"
        />
        <Button
          type="button"
          size="icon"
          onClick={onSend}
          disabled={sending || (!text.trim() && !staged)}
          className={cn(!text.trim() && !staged && "opacity-60")}
          aria-label="Send"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-5 w-5" />}
        </Button>
      </div>

      <p className="mt-1 hidden sm:block text-[11px] text-muted-foreground">
        <ImageIcon className="inline h-3 w-3 mr-1" />
        Drag a file here, or press <kbd className="rounded bg-muted px-1">Enter</kbd> to send.
      </p>
    </div>
  );
}
