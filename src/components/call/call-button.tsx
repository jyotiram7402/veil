"use client";

import { Phone, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCallActions } from "@/components/call/call-provider";

/**
 * Voice/video call button for a 1-to-1 chat header. Must be rendered inside a
 * CallProvider. Disabled while a call is already in progress. Server-side
 * authorization still gates the actual call regardless of this button.
 */
export function CallButton({
  mode = "voice",
  className,
}: {
  mode?: "voice" | "video";
  className?: string;
}) {
  const { startVoice, startVideo, busy } = useCallActions();
  const isVideo = mode === "video";
  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={isVideo ? startVideo : startVoice}
      disabled={busy}
      aria-label={isVideo ? "Start video call" : "Start voice call"}
      className={className}
    >
      {isVideo ? <Video className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
    </Button>
  );
}
