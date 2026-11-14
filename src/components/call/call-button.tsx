"use client";

import { Phone, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCallActions } from "@/components/call/call-provider";

/**
 * Voice/video call button for the header of a 1-to-1 chat. Needs a CallProvider
 * above it that knows this chat; without one, or while a call is already in
 * progress, it is disabled. Server-side authorization still gates the actual
 * call regardless of this button.
 */
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
