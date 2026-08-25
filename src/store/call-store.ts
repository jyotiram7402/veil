"use client";

import { create } from "zustand";
import type { CallState, PeerInfo } from "@/lib/webrtc/types";
import type { Quality } from "@/lib/webrtc/stats";

type CallStore = {
  state: CallState;
  callId: string | null;
  isCaller: boolean;
  peer: PeerInfo | null;
  muted: boolean;
  connectedAt: number | null;
  errorMessage: string | null;

  // additions
  quality: Quality;
  speaking: boolean; // local mic activity
  reconnectAttempt: number;
  outputDeviceId: string | null;

  // additions — media state (tracked separately from call state)
  videoEnabled: boolean; // local camera on
  remoteAudioOn: boolean;
  remoteVideoOn: boolean;
  cameraError: string | null;
  localStream: MediaStream | null; // local camera preview (video only)
  remoteStream: MediaStream | null; // remote audio+video
  minimized: boolean; // call collapsed to a bar so chat is usable underneath

  startOutgoing: (callId: string, peer: PeerInfo) => void;
  startIncoming: (callId: string, peer: PeerInfo) => void;
  setState: (state: CallState) => void;
  setConnected: () => void;
  setMuted: (muted: boolean) => void;
  setQuality: (quality: Quality) => void;
  setSpeaking: (speaking: boolean) => void;
  setReconnectAttempt: (n: number) => void;
  setOutputDevice: (id: string | null) => void;
  setVideoEnabled: (on: boolean) => void;
  setRemoteMedia: (media: { audio: boolean; video: boolean }) => void;
  setCameraError: (message: string | null) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  setMinimized: (minimized: boolean) => void;
  fail: (message: string) => void;
  reset: () => void;
};

const initial = {
  state: "idle" as CallState,
  callId: null,
  isCaller: false,
  peer: null,
  muted: false,
  connectedAt: null,
  errorMessage: null,
  quality: "unknown" as Quality,
  speaking: false,
  reconnectAttempt: 0,
  outputDeviceId: null,
  videoEnabled: false,
  remoteAudioOn: true,
  remoteVideoOn: false,
  cameraError: null,
  localStream: null,
  remoteStream: null,
  minimized: false,
};

export const useCallStore = create<CallStore>((set) => ({
  ...initial,

  startOutgoing: (callId, peer) =>
    set({ ...initial, state: "calling", callId, peer, isCaller: true }),
  startIncoming: (callId, peer) =>
    set({ ...initial, state: "ringing", callId, peer, isCaller: false }),
  setState: (state) => set({ state }),
  // Only stamp connectedAt the first time we connect, so the timer survives a
  // reconnection without resetting.
  setConnected: () =>
    set((s) => ({ state: "connected", connectedAt: s.connectedAt ?? Date.now() })),
  setMuted: (muted) => set({ muted }),
  setQuality: (quality) => set({ quality }),
  setSpeaking: (speaking) => set({ speaking }),
  setReconnectAttempt: (reconnectAttempt) => set({ reconnectAttempt }),
  setOutputDevice: (outputDeviceId) => set({ outputDeviceId }),
  setVideoEnabled: (videoEnabled) => set({ videoEnabled }),
  setRemoteMedia: ({ audio, video }) => set({ remoteAudioOn: audio, remoteVideoOn: video }),
  setCameraError: (cameraError) => set({ cameraError }),
  setLocalStream: (localStream) => set({ localStream }),
  setRemoteStream: (remoteStream) => set({ remoteStream }),
  setMinimized: (minimized) => set({ minimized }),
  fail: (message) => set({ state: "failed", errorMessage: message }),
  reset: () => set({ ...initial }),
}));
