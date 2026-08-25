/**
 * Shared types for the voice-calling signaling protocol and call state.
 *
 * Signaling is carried as Supabase Realtime BROADCAST events on the private
 * channel `call:<chatId>`. Only SDP/ICE control data travels here — never audio.
 */

export type CallState =
  | "idle"
  | "calling" // caller: waiting for callee to pick up
  | "ringing" // callee: incoming call awaiting accept/reject
  | "connecting" // accepted, negotiating / ICE
  | "connected" // media flowing
  | "reconnecting" // transient drop; attempting ICE restart / recovery
  | "disconnected" // lost, awaiting recovery decision
  | "rejected"
  | "busy"
  | "ending" // teardown in progress
  | "failed"
  | "ended";

export type SignalType =
  | "call_started"
  | "call_accepted"
  | "call_rejected"
  | "call_cancelled"
  | "offer"
  | "answer"
  | "ice_candidate"
  | "call_ended"
  | "busy"
  | "media_state"; // peer announces its own audio/video on/off state

export type PeerInfo = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

/** One signaling message. `senderId` is informational; authorization is by RLS. */
export type SignalPayload = {
  callId: string;
  senderId: string;
  // call_started carries the caller's identity + the initial SDP offer
  from?: PeerInfo;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  reason?: string;
  // media_state: the sender's current local media state
  media?: { audio: boolean; video: boolean };
};

export const CALL_RING_TIMEOUT_MS = 35_000;
