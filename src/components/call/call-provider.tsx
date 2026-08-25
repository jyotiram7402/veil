"use client";

import { createContext, useContext, useRef } from "react";
import { useCall } from "@/hooks/use-call";
import { useCallStore } from "@/store/call-store";
import { CallOverlay } from "@/components/call/call-overlay";
import type { Profile } from "@/types/chat";

type CallActions = {
  startVoice: () => void;
  startVideo: () => void;
  /** true while a call is active/ringing so the buttons can disable themselves. */
  busy: boolean;
};

const CallContext = createContext<CallActions | null>(null);

/** Access the call actions from anywhere inside a CallProvider (e.g. the header buttons). */
export function useCallActions(): CallActions {
  return (
    useContext(CallContext) ?? { startVoice: () => undefined, startVideo: () => undefined, busy: false }
  );
}

/**
 * Wraps a 1-to-1 (direct) chat. Owns the signaling channel + WebRTC engine for
 * that conversation, renders the call overlay, and exposes `startCall` to the
 * header button via context. Mount this ONLY around direct chats.
 */
export function CallProvider({
  me,
  other,
  chatId,
  children,
}: {
  me: Profile;
  other: Pick<Profile, "id" | "username" | "display_name" | "avatar_url">;
  chatId: string;
  children: React.ReactNode;
}) {
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const {
    startCall,
    accept,
    reject,
    hangUp,
    toggleMute,
    toggleCamera,
    switchCamera,
    selectOutputDevice,
  } = useCall({ chatId, me, other, remoteAudioRef });
  const busy = useCallStore((s) => s.state !== "idle");

  return (
    <CallContext.Provider
      value={{ startVoice: () => startCall(false), startVideo: () => startCall(true), busy }}
    >
      {children}
      {/* Remote audio sink — hidden, autoplay. Never plays local audio (no echo). */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
      <CallOverlay
        me={me}
        accept={accept}
        reject={reject}
        hangUp={hangUp}
        toggleMute={toggleMute}
        toggleCamera={toggleCamera}
        switchCamera={switchCamera}
        selectOutputDevice={selectOutputDevice}
      />
    </CallContext.Provider>
  );
}
