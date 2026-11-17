"use client";

import { Phone, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCallActions } from "@/components/call/call-provider";

export function CallButton({
  chatId,
  mode = "voice",
  className,
}: {
  chatId: string;
  mode?: "voice" | "video";
  className?: string;
}) {
  const { startVoice, startVideo, canCall, busy } = useCallActions();
  const isVideo = mode === "video";
  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={() => (isVideo ? startVideo(chatId) : startVoice(chatId))}
      disabled={busy || !canCall(chatId)}
      aria-label={isVideo ? "Start video call" : "Start voice call"}
      className={className}
    >
      {isVideo ? <Video className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
    </Button>
  );
}
