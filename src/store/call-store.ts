"use client";

import { create } from "zustand";
import type { CallState, MediaState, PeerInfo } from "@/lib/webrtc/types";
import type { Quality, VideoNumbers } from "@/lib/webrtc/stats";

type CallStore = {
  state: CallState;
  callId: string | null;
  chatId: string | null;
  isCaller: boolean;
  peer: PeerInfo | null;
  muted: boolean;
  connectedAt: number | null;
  errorMessage: string | null;

  quality: Quality;
  speaking: boolean;
  reconnectAttempt: number;
  outputDeviceId: string | null;

  mediaReady: boolean;
  videoEnabled: boolean;
  remoteAudioOn: boolean;
  remoteVideoOn: boolean;
  cameraError: string | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  minimized: boolean;
  sentVideo: VideoNumbers | null;
  receivedVideo: VideoNumbers | null;
  relayed: boolean | null;

  startOutgoing: (callId: string, chatId: string, peer: PeerInfo) => void;
  startIncoming: (callId: string, chatId: string, peer: PeerInfo, media?: MediaState) => void;
  setState: (state: CallState) => void;
  setConnected: () => void;
  setMuted: (muted: boolean) => void;
  setQuality: (quality: Quality) => void;
  setSpeaking: (speaking: boolean) => void;
  setReconnectAttempt: (n: number) => void;
  setOutputDevice: (id: string | null) => void;
  setMediaReady: (ready: boolean) => void;
  setVideoEnabled: (on: boolean) => void;
  setRemoteMedia: (media: MediaState) => void;
  setCameraError: (message: string | null) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  setMinimized: (minimized: boolean) => void;
  setVideoNumbers: (sent: VideoNumbers | null, received: VideoNumbers | null) => void;
  setRelayed: (relayed: boolean | null) => void;
  close: (state: CallState, message?: string | null) => void;
  reset: () => void;
};

const initial = {
  state: "idle" as CallState,
  callId: null,
  chatId: null,
  isCaller: false,
  peer: null,
  muted: false,
  connectedAt: null,
  errorMessage: null,
  quality: "unknown" as Quality,
  speaking: false,
  reconnectAttempt: 0,
  outputDeviceId: null,
  mediaReady: false,
  videoEnabled: false,
  remoteAudioOn: true,
  remoteVideoOn: false,
  cameraError: null,
  localStream: null,
  remoteStream: null,
  minimized: false,
  sentVideo: null,
  receivedVideo: null,
  relayed: null as boolean | null,
};

function sameNumbers(a: VideoNumbers | null, b: VideoNumbers | null): boolean {
  if (!a || !b) return a === b;
  return a.width === b.width && a.height === b.height && a.fps === b.fps;
}

export const useCallStore = create<CallStore>((set) => ({
  ...initial,

  startOutgoing: (callId, chatId, peer) =>
    set({ ...initial, state: "calling", callId, chatId, peer, isCaller: true }),
  startIncoming: (callId, chatId, peer, media) =>
    set({
      ...initial,
      state: "ringing",
      callId,
      chatId,
      peer,
      isCaller: false,
      remoteAudioOn: media?.audio ?? true,
      remoteVideoOn: media?.video ?? false,
    }),
  setState: (state) => set({ state }),
  setConnected: () =>
    set((s) => ({ state: "connected", connectedAt: s.connectedAt ?? Date.now() })),
  setMuted: (muted) => set({ muted }),
  setQuality: (quality) => set({ quality }),
  setSpeaking: (speaking) => set({ speaking }),
  setReconnectAttempt: (reconnectAttempt) => set({ reconnectAttempt }),
  setOutputDevice: (outputDeviceId) => set({ outputDeviceId }),
  setMediaReady: (mediaReady) => set({ mediaReady }),
  setVideoEnabled: (videoEnabled) => set({ videoEnabled }),
  setRemoteMedia: ({ audio, video }) => set({ remoteAudioOn: audio, remoteVideoOn: video }),
  setCameraError: (cameraError) => set({ cameraError }),
  setLocalStream: (localStream) => set({ localStream }),
  setRemoteStream: (remoteStream) => set({ remoteStream }),
  setMinimized: (minimized) => set({ minimized }),
  setVideoNumbers: (sent, received) =>
    set((s) =>
      sameNumbers(s.sentVideo, sent) && sameNumbers(s.receivedVideo, received)
        ? s
        : {
            sentVideo: sent ? { width: sent.width, height: sent.height, fps: sent.fps } : null,
            receivedVideo: received,
          },
    ),
  setRelayed: (relayed) => set((s) => (s.relayed === relayed ? s : { relayed })),
  close: (state, message = null) => set({ state, errorMessage: message }),
  reset: () => set({ ...initial }),
}));
