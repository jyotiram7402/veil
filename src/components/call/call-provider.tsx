"use client";

import { createContext, useContext, useMemo, useRef } from "react";
import { useCall, type CallChat } from "@/hooks/use-call";
import { useCallStore } from "@/store/call-store";
import { CallScreen } from "@/components/call/call-screen";
import type { Profile } from "@/types/chat";

type CallActions = {
  startVoice: (chatId: string) => void;
  startVideo: (chatId: string) => void;
  canCall: (chatId: string) => boolean;
  busy: boolean;
};

const CallContext = createContext<CallActions | null>(null);

const NO_CALLS: CallActions = {
  startVoice: () => undefined,
  startVideo: () => undefined,
  canCall: () => false,
  busy: false,
};

export function useCallActions(): CallActions {
  return useContext(CallContext) ?? NO_CALLS;
}

export function CallProvider({
  me,
  chats,
  onOpenChat,
  children,
}: {
  me: Profile;
  chats: CallChat[];
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
