"use client";

import { createContext, useContext, useMemo, useRef } from "react";
import { useCall, type CallChat } from "@/hooks/use-call";
import { useCallStore } from "@/store/call-store";
import { CallScreen } from "@/components/call/call-screen";
import type { Profile } from "@/types/chat";

type CallActions = {
  startVoice: (chatId: string) => void;
  startVideo: (chatId: string) => void;
  /** Whether a call can be made in this chat at all (it is one of the provider's chats). */
  canCall: (chatId: string) => boolean;
  /** true while a call is active/ringing so the buttons can disable themselves. */
  busy: boolean;
};

const CallContext = createContext<CallActions | null>(null);

const NO_CALLS: CallActions = {
  startVoice: () => undefined,
  startVideo: () => undefined,
  canCall: () => false,
  busy: false,
};

/** Access the call actions from anywhere inside a CallProvider (e.g. the header buttons). */
export function useCallActions(): CallActions {
  return useContext(CallContext) ?? NO_CALLS;
}

/**
 * Calls for the whole app. Mounted once, around everything a signed-in person
 * can see: it listens for incoming calls on every chat in `chats`, so a call
 * rings on any screen and keeps running while the person moves between
 * screens. It owns the engine, renders the call screen, and gives the header
 * buttons `startVoice` / `startVideo` through context.
 */
export function CallProvider({
  me,
  chats,
  onOpenChat,
  children,
}: {
  me: Profile;
  /** Every 1:1 chat this person can call and be called in. */
  chats: CallChat[];
  /** Where "Chat" on the call screen goes, when the app has more than one screen. */
  onOpenChat?: (chatId: string) => void;
  children: React.ReactNode;
}) {
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const {
    startCall,
    accept,
    reject,
    hangUp,
    dismiss,
    toggleMute,
    toggleCamera,
    switchCamera,
    selectOutputDevice,
  } = useCall({ me, chats, remoteAudioRef });
  const busy = useCallStore((s) => s.state !== "idle");

  const chatIds = chats.map((c) => c.chatId).join(",");
  const actions = useMemo<CallActions>(() => {
    const callable = new Set(chatIds ? chatIds.split(",") : []);
    return {
      startVoice: (chatId) => void startCall(chatId, false),
      startVideo: (chatId) => void startCall(chatId, true),
      canCall: (chatId) => callable.has(chatId),
      busy,
    };
  }, [chatIds, startCall, busy]);

  return (
    <CallContext.Provider value={actions}>
      {children}
      {/* Remote audio sink — hidden, autoplay. Never plays local audio (no echo). */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
      <CallScreen
        accept={accept}
        reject={reject}
        hangUp={hangUp}
        dismiss={dismiss}
        toggleMute={toggleMute}
        toggleCamera={toggleCamera}
        switchCamera={switchCamera}
        selectOutputDevice={selectOutputDevice}
        onOpenChat={onOpenChat}
      />
    </CallContext.Provider>
  );
}
