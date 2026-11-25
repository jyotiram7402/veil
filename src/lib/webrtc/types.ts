export type CallState =
  | "idle"
  | "calling"
  | "ringing"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "rejected"
  | "busy"
  | "ending"
  | "failed"
  | "ended";

export function isCallOver(state: CallState): boolean {
  return state === "ended" || state === "failed" || state === "rejected" || state === "busy";
}

export type SignalType =
  | "call_started"
  | "call_ring"
  | "call_ringing"
  | "call_accepted"
  | "call_rejected"
  | "call_cancelled"
  | "offer"
  | "answer"
  | "ice_candidate"
  | "call_ended"
  | "busy"
  | "media_state";

export type PeerInfo = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

export type SignalPayload = {
  callId: string;
  senderId: string;
  from?: PeerInfo;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  reason?: string;
  media?: MediaState;
};

export type MediaState = { audio: boolean; video: boolean };

export const CALL_RING_TIMEOUT_MS = 45_000;
export const RING_REPEAT_MS = 2_000;
export const RING_AFTER_REACHED_MS = 25_000;
export const MAX_RING_MS = 90_000;
export const RING_SILENCE_MS = 8_000;
