"use client";

import { useCallback, useEffect, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCallStore } from "@/store/call-store";
import { getRtcConfig, isWebRtcSupported } from "@/lib/webrtc/ice";
import {
  audioConstraints,
  preferOpus,
  relaxedVideoConstraints,
  videoConstraints,
  type CameraChoice,
} from "@/lib/webrtc/codec";
import { createQualitySampler, STATS_INTERVAL_MS } from "@/lib/webrtc/stats";
import { monitorAudioLevel, type AudioLevelMonitor } from "@/lib/webrtc/audio-level";
import { realAudioOutputs } from "@/lib/webrtc/devices";
import {
  callErrorMessage,
  classifyCameraError,
  classifyMediaError,
  type CallErrorCode,
} from "@/lib/webrtc/errors";
import { SignalingChannel } from "@/lib/webrtc/signaling";
import {
  CALL_RING_TIMEOUT_MS,
  isCallOver,
  type PeerInfo,
  type SignalPayload,
  type SignalType,
} from "@/lib/webrtc/types";
import type { Profile } from "@/types/chat";

type Person = Pick<Profile, "id" | "username" | "display_name" | "avatar_url">;

/** A 1:1 chat a call can happen in, and the person on its other end. */
export type CallChat = { chatId: string; other: Person };

type UseCallArgs = {
  me: Profile;
  /**
   * Every chat to listen on for incoming calls. A member has one (with the
   * admin); the admin has one per person, so a call rings on any screen.
   */
  chats: CallChat[];
  remoteAudioRef: React.RefObject<HTMLAudioElement | null>;
};

const RECONNECT_DELAYS = [1500, 3000, 6000];
const MAX_RECONNECT = RECONNECT_DELAYS.length;
const DISCONNECT_GRACE_MS = 2000;
// How long a closing screen ("Call ended", "No answer") stays up before the
// call UI goes away by itself. An error does not go by itself: it says what to
// do, so it stays until it is closed.
const ENDED_LINGER_MS = 2500;

// A phone needs a moment to let go of a camera before it can open the other one.
const CAMERA_RELEASE_MS = 400;

function cameraIsBusy(err: unknown): boolean {
  return (
    err instanceof DOMException && (err.name === "NotReadableError" || err.name === "AbortError")
  );
}

/**
 * Opens one camera: the good picture first, then whatever that camera gives.
 * If it is still busy (a phone that just let go of its other camera), wait a
 * moment and try once more.
 */
async function openCamera(camera: CameraChoice): Promise<MediaStream> {
  const open = async () => {
    try {
      return await navigator.mediaDevices.getUserMedia(videoConstraints(camera));
    } catch {
      // 720p (or that frame rate) unavailable → take what the camera has.
      return navigator.mediaDevices.getUserMedia(relaxedVideoConstraints(camera));
    }
  };
  try {
    return await open();
  } catch (err) {
    if (!cameraIsBusy(err)) throw err;
    await new Promise((resolve) => setTimeout(resolve, CAMERA_RELEASE_MS));
    return open();
  }
}

function peerInfo(p: Person): PeerInfo {
  return { id: p.id, name: p.display_name ?? p.username, avatarUrl: p.avatar_url };
}

function reasonToCode(reason?: string): CallErrorCode {
  switch (reason) {
    case "ROOM_ENDED":
      return "ROOM_ENDED";
    case "PERMISSION_REVOKED":
      return "PERMISSION_REVOKED";
    case "SESSION_EXPIRED":
      return "SESSION_EXPIRED";
    default:
      return "PERMISSION_REVOKED";
  }
}

/**
 * The 1-to-1 calling engine (voice, video, quality monitoring, reconnection).
 * One instance serves the whole app: it listens on the signaling channel of
 * every chat in `chats` and runs at most one call at a time, on one
 * RTCPeerConnection. All WebRTC lifecycle lives here — UI only reads the store
 * and calls the returned actions.
 */
export function useCall({ me, chats, remoteAudioRef }: UseCallArgs) {
  const store = useCallStore;
  // Who is on the other end of each chat. Read through a ref, so the signal
  // handlers always see the current list.
  const peopleRef = useRef(new Map<string, Person>());
  peopleRef.current = new Map(chats.map((c) => [c.chatId, c.other]));

  // One signaling channel per chat, and the chat the current call runs in.
  const channelsRef = useRef(new Map<string, SignalingChannel>());
  const activeChatRef = useRef<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const senderRef = useRef<RTCRtpSender | null>(null);
  const videoSenderRef = useRef<RTCRtpSender | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const facingRef = useRef<"user" | "environment">("user");
  const usedVideoRef = useRef(false); // did this call ever use the camera?
  const callIdRef = useRef<string | null>(null);
  const incomingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const negotiatingRef = useRef(false);

  const statsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const authTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopCameraRef = useRef<((reason?: CallErrorCode) => void) | null>(null);
  const startCameraRef = useRef<
    ((cameras?: CameraChoice[], preAuthorized?: boolean) => Promise<void>) | null
  >(null);
  // Camera changes run one at a time: the connection one is at work for, and a
  // count that goes up each time the camera is told to stop.
  const cameraBusyRef = useRef<RTCRtpSender | null>(null);
  const cameraStopsRef = useRef(0);
  const samplerRef = useRef<ReturnType<typeof createQualitySampler> | null>(null);
  const audioMonitorRef = useRef<AudioLevelMonitor | null>(null);

  /** Send to the other person of the current call (on that chat's channel). */
  const send = useCallback(
    (type: SignalType, extra: Partial<SignalPayload> = {}) => {
      const callId = callIdRef.current;
      const chatId = activeChatRef.current;
      if (!callId || !chatId) return;
      void channelsRef.current.get(chatId)?.send(type, { callId, senderId: me.id, ...extra });
    },
    [me.id],
  );

  const updateSession = useCallback((patch: Record<string, unknown>) => {
    const callId = callIdRef.current;
    if (!callId) return;
    void supabaseBrowser().from("call_sessions").update(patch).eq("id", callId).then(
      () => undefined,
      () => undefined,
    );
  }, []);

  /** Server re-authorization for the chat of the current call (membership / room / voice|video). */
  const authorize = useCallback(
    async (feature: "voice" | "video" = "voice"): Promise<{ ok: boolean; reason?: string }> => {
      const chatId = activeChatRef.current;
      if (!chatId) return { ok: false, reason: "SESSION_EXPIRED" };
      try {
        const res = await fetch(
          `/api/calls/authorize?chatId=${encodeURIComponent(chatId)}&feature=${feature}`,
          { cache: "no-store" },
        );
        if (!res.ok) return { ok: false, reason: "SESSION_EXPIRED" };
        return (await res.json()) as { ok: boolean; reason?: string };
      } catch {
        return { ok: false, reason: "SESSION_EXPIRED" };
      }
    },
    [],
  );

  const broadcastMediaState = useCallback(() => {
    send("media_state", {
      media: { audio: !store.getState().muted, video: store.getState().videoEnabled },
    });
  }, [send, store]);

  /**
   * Post ONE call event to the chat timeline. Caller-only (avoids duplicates);
   * the server is also idempotent. Auto-derives completed/cancelled from
   * whether the call ever connected. Must run BEFORE teardown nulls callId.
   */
  const postOutcome = useCallback(
    (explicit?: "missed" | "declined" | "failed") => {
      if (!store.getState().isCaller) return;
      const callId = callIdRef.current;
      if (!callId) return;
      const status = explicit ?? (store.getState().connectedAt ? "completed" : "cancelled");
      void fetch(`/api/calls/${callId}/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, kind: usedVideoRef.current ? "video" : "voice" }),
      }).catch(() => undefined);
    },
    [store],
  );

  const stopMonitors = useCallback(() => {
    if (statsTimerRef.current) clearInterval(statsTimerRef.current);
    statsTimerRef.current = null;
    if (authTimerRef.current) clearInterval(authTimerRef.current);
    authTimerRef.current = null;
    samplerRef.current = null;
    audioMonitorRef.current?.stop();
    audioMonitorRef.current = null;
    store.getState().setSpeaking(false);
    store.getState().setQuality("unknown");
  }, [store]);

  const startMonitors = useCallback(() => {
    // Quality sampling (throttled, local only).
    if (!statsTimerRef.current) {
      samplerRef.current = createQualitySampler();
      statsTimerRef.current = setInterval(async () => {
        const pc = pcRef.current;
        const sampler = samplerRef.current;
        if (!pc || !sampler) return;
        const s = await sampler(pc);
        store.getState().setQuality(s.quality);
      }, STATS_INTERVAL_MS);
    }
    // Local mic activity → "speaking" dot.
    if (!audioMonitorRef.current && localStreamRef.current) {
      audioMonitorRef.current = monitorAudioLevel(localStreamRef.current, (speaking) =>
        store.getState().setSpeaking(speaking),
      );
    }
  }, [store]);

  const clearReconnect = useCallback(() => {
    if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    disconnectTimerRef.current = null;
    reconnectTimerRef.current = null;
  }, []);

  const teardown = useCallback(() => {
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
    ringTimeoutRef.current = null;
    clearReconnect();
    stopMonitors();
    reconnectAttemptRef.current = 0;
    negotiatingRef.current = false;

    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.oniceconnectionstatechange = null;
      try {
        pcRef.current.close();
      } catch {
        /* ignore */
      }
      pcRef.current = null;
    }
    senderRef.current = null;
    videoSenderRef.current = null;
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) track.stop();
      localStreamRef.current = null;
    }
    if (videoStreamRef.current) {
      for (const track of videoStreamRef.current.getTracks()) {
        track.onended = null;
        track.stop();
      }
      videoStreamRef.current = null;
    }
    // The next call starts on the front camera again, whichever was used last.
    facingRef.current = "user";
    cameraStopsRef.current++;
    remoteStreamRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    incomingOfferRef.current = null;
    pendingCandidatesRef.current = [];
    callIdRef.current = null;
    activeChatRef.current = null;
  }, [clearReconnect, stopMonitors, remoteAudioRef]);

  /**
   * End the call and show its closing screen: `message` is the error for
   * "failed", or a short note such as "No answer". The screen goes away by
   * itself after a moment (an error only through dismiss()).
   */
  const finish = useCallback(
    (final: "rejected" | "busy" | "failed" | "ended", message?: string) => {
      teardown();
      store.getState().close(final, message ?? null);
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
      if (final === "failed") return;
      resetTimeoutRef.current = setTimeout(() => {
        resetTimeoutRef.current = null;
        store.getState().reset();
      }, ENDED_LINGER_MS);
    },
    [store, teardown],
  );

  const finishWithError = useCallback(
    (code: CallErrorCode) => finish("failed", callErrorMessage(code)),
    [finish],
  );

  // ---- Reconnection ---------------------------------------------------------

  const handleConnUp = useCallback(() => {
    clearReconnect();
    reconnectAttemptRef.current = 0;
    store.getState().setReconnectAttempt(0);
    store.getState().setConnected();
    updateSession({ status: "connected", connected_at: new Date().toISOString() });
    startMonitors();
    // Resync media state with the peer after (re)connect.
    broadcastMediaState();
    // Periodically re-check authorization so a mid-call revocation (participant
    // removed/blocked/suspended, room ended, voice disabled) ends the call even
    // if the media connection itself never drops. Video can be revoked on its
    // own (camera stops, voice continues).
    if (!authTimerRef.current) {
      authTimerRef.current = setInterval(async () => {
        // The answers below belong to this call only: by the time they arrive
        // it may have ended and another one begun.
        const callId = callIdRef.current;
        const voice = await authorize("voice");
        if (callIdRef.current !== callId) return;
        if (!voice.ok) {
          postOutcome();
          finishWithError(reasonToCode(voice.reason));
          return;
        }
        if (store.getState().videoEnabled) {
          const video = await authorize("video");
          if (callIdRef.current !== callId) return;
          if (!video.ok) void stopCameraRef.current?.("PERMISSION_REVOKED");
        }
      }, 30_000);
    }
  }, [clearReconnect, store, updateSession, startMonitors, authorize, finishWithError, broadcastMediaState, postOutcome]);

  const doIceRestart = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || negotiatingRef.current) return;
    negotiatingRef.current = true;
    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      send("offer", { sdp: offer });
    } catch {
      /* next attempt will retry */
    } finally {
      negotiatingRef.current = false;
    }
  }, [send]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) return;
    const attempt = reconnectAttemptRef.current;
    if (attempt >= MAX_RECONNECT) {
      postOutcome(); // it had connected → logs as completed with its duration
      finishWithError("RECONNECT_FAILED");
      return;
    }
    const delay = RECONNECT_DELAYS[attempt] ?? RECONNECT_DELAYS[RECONNECT_DELAYS.length - 1]!;
    reconnectTimerRef.current = setTimeout(async () => {
      reconnectTimerRef.current = null;
      const pc = pcRef.current;
      if (!pc) return;
      if (pc.connectionState === "connected" || pc.iceConnectionState === "connected") {
        handleConnUp();
        return;
      }
      // Revalidate authorization on every recovery attempt.
      const auth = await authorize();
      if (!auth.ok) {
        postOutcome();
        finishWithError(reasonToCode(auth.reason));
        return;
      }
      reconnectAttemptRef.current = attempt + 1;
      store.getState().setReconnectAttempt(attempt + 1);
      // Only the caller drives ICE restart (avoids glare); the callee answers.
      if (store.getState().isCaller) await doIceRestart();
      scheduleReconnect();
    }, delay);
  }, [authorize, doIceRestart, finishWithError, handleConnUp, store, postOutcome]);

  const enterReconnecting = useCallback(() => {
    const s = store.getState().state;
    if (s === "idle" || s === "ended" || s === "failed" || s === "rejected" || s === "busy") return;
    store.getState().setState("reconnecting");
    scheduleReconnect();
  }, [store, scheduleReconnect]);

  // ---- Peer connection ------------------------------------------------------

  const applySinkId = useCallback(() => {
    const el = remoteAudioRef.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    const id = store.getState().outputDeviceId;
    if (el && id && typeof el.setSinkId === "function") {
      void el.setSinkId(id).catch(() => undefined);
    }
  }, [remoteAudioRef, store]);

  const createPeer = useCallback(() => {
    const pc = new RTCPeerConnection(getRtcConfig());

    pc.onicecandidate = (e) => {
      if (e.candidate) send("ice_candidate", { candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      // Accumulate remote tracks (audio + video) into one persistent stream.
      if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();
      const remote = remoteStreamRef.current;
      if (!remote.getTracks().some((t) => t.id === e.track.id)) remote.addTrack(e.track);
      // Audio plays through the hidden audio element (setSinkId target); the
      // call screen's <video> element binds the same stream (muted) for video.
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remote;
        applySinkId();
        void remoteAudioRef.current.play().catch(() => undefined);
      }
      store.getState().setRemoteStream(remote);
      // A video track arrives on every call (the line is negotiated up front),
      // so it says nothing about the other camera. Whether that camera is on
      // comes from call_started and media_state.
    };
    pc.onconnectionstatechange = () => {
      switch (pc.connectionState) {
        case "connected":
          handleConnUp();
          break;
        case "disconnected":
          // Transient — wait briefly before treating as a drop.
          if (!disconnectTimerRef.current) {
            disconnectTimerRef.current = setTimeout(() => {
              disconnectTimerRef.current = null;
              if (pc.connectionState !== "connected") enterReconnecting();
            }, DISCONNECT_GRACE_MS);
          }
          break;
        case "failed":
          enterReconnecting();
          break;
      }
    };
    pc.oniceconnectionstatechange = () => {
      switch (pc.iceConnectionState) {
        case "connected":
        case "completed":
          handleConnUp();
          break;
        case "failed":
          enterReconnecting();
          break;
      }
    };

    pcRef.current = pc;
    return pc;
  }, [send, remoteAudioRef, applySinkId, handleConnUp, enterReconnecting, store]);

  /**
   * Opens the microphone and adds it to the connection. Resolves false when the
   * call was closed while the browser was still asking for permission; the
   * microphone is released again in that case.
   */
  const attachLocalMedia = useCallback(
    async (pc: RTCPeerConnection, role: "caller" | "callee"): Promise<boolean> => {
      const stream = await navigator.mediaDevices.getUserMedia(audioConstraints());
      if (pcRef.current !== pc) {
        for (const track of stream.getTracks()) track.stop();
        return false;
      }
      localStreamRef.current = stream;
      const [track] = stream.getAudioTracks();
      if (track) {
        // Mute may have been tapped before the microphone was ready.
        track.enabled = !store.getState().muted;
        senderRef.current = pc.addTrack(track, stream);
        // Prefer Opus on the audio transceiver (feature-detected, safe no-op else).
        const audioTx = pc.getTransceivers().find((t) => t.sender === senderRef.current);
        preferOpus(audioTx);
      }
      // The caller offers a video line up front, so turning a camera on or off
      // later is a plain replaceTrack(): no renegotiation. The callee must not
      // add a line of its own; it takes over the offered one (adoptOfferedVideo).
      if (role === "caller") {
        videoSenderRef.current = pc.addTransceiver("video", { direction: "sendrecv" }).sender;
        store.getState().setMediaReady(true);
      }
      return true;
    },
    [store],
  );

  /**
   * Callee, right after reading the offer: send our camera on the video line the
   * caller offered. A transceiver the callee creates itself is never paired with
   * that line (only ones made by addTrack are), so its picture would not reach
   * the caller.
   */
  const adoptOfferedVideo = useCallback(
    (pc: RTCPeerConnection) => {
      const offered = pc
        .getTransceivers()
        .find((t) => t.mid !== null && t.receiver.track.kind === "video");
      if (offered) offered.direction = "sendrecv";
      videoSenderRef.current = offered?.sender ?? null;
      store.getState().setMediaReady(!!offered);
    },
    [store],
  );

  const drainCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    const pending = pendingCandidatesRef.current;
    pendingCandidatesRef.current = [];
    for (const c of pending) {
      try {
        await pc.addIceCandidate(c);
      } catch {
        /* ignore late/duplicate */
      }
    }
  }, []);

  // ---- Public actions -------------------------------------------------------

  const startCall = useCallback(
    async (chatId: string, withVideo = false) => {
      const other = peopleRef.current.get(chatId);
      if (!other) return; // not a chat we can call in
      if (store.getState().state !== "idle") return; // double-call protection

      const callId = crypto.randomUUID();
      callIdRef.current = callId;
      activeChatRef.current = chatId;
      usedVideoRef.current = false;
      // Open the call screen at once: the steps below can each take a moment,
      // and any of them failing needs a screen to say so.
      store.getState().startOutgoing(callId, chatId, peerInfo(other));
      // False once this call has been cancelled or replaced (teardown clears the id).
      const stillOurs = () => callIdRef.current === callId;

      if (!isWebRtcSupported()) {
        finishWithError("UNSUPPORTED");
        return;
      }
      const auth = await authorize(withVideo ? "video" : "voice");
      if (!stillOurs()) return;
      if (!auth.ok) {
        finishWithError(reasonToCode(auth.reason));
        return;
      }

      try {
        const pc = createPeer();
        if (!(await attachLocalMedia(pc, "caller"))) return;
        // Video call: capture the camera up front so the initial offer carries
        // the video track (voice→video upgrade later is the same replaceTrack).
        if (withVideo) await startCameraRef.current?.(undefined, true);
        if (!stillOurs()) return;

        void supabaseBrowser()
          .from("call_sessions")
          .insert({
            id: callId,
            chat_id: chatId,
            caller_id: me.id,
            callee_id: other.id,
            status: "ringing",
            kind: withVideo ? "video" : "voice",
          })
          .then(() => undefined, () => undefined);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (!stillOurs()) return;
        // `media` tells the other side whether this is a voice or a video call.
        send("call_started", {
          from: peerInfo(me),
          sdp: offer,
          media: { audio: !store.getState().muted, video: store.getState().videoEnabled },
        });

        ringTimeoutRef.current = setTimeout(() => {
          if (store.getState().state === "calling") {
            send("call_cancelled", { reason: "no answer" });
            updateSession({ status: "missed", ended_at: new Date().toISOString(), end_reason: "no answer" });
            postOutcome("missed");
            finish("ended", "No answer");
          }
        }, CALL_RING_TIMEOUT_MS);
      } catch (err) {
        if (!stillOurs()) return; // cancelled meanwhile: nothing to report
        send("call_cancelled", { reason: "error" });
        postOutcome("failed");
        finishWithError(classifyMediaError(err));
      }
    },
    [store, me, authorize, createPeer, attachLocalMedia, send, updateSession, finish, finishWithError, postOutcome],
  );

  /** Answer the ringing call. `withVideo` also turns our camera on. */
  const accept = useCallback(
    async (withVideo = false) => {
      const offer = incomingOfferRef.current;
      const callId = callIdRef.current;
      if (!offer || !callId || store.getState().state !== "ringing") return;
      const stillOurs = () => callIdRef.current === callId;

      // Leave "ringing" at once: the tap shows straight away and cannot answer twice.
      store.getState().setState("connecting");
      const auth = await authorize(withVideo ? "video" : "voice");
      if (!stillOurs()) return;
      if (!auth.ok) {
        send("call_rejected", { reason: "unauthorized" });
        finishWithError(reasonToCode(auth.reason));
        return;
      }

      try {
        const pc = createPeer();
        if (!(await attachLocalMedia(pc, "callee"))) return;
        await pc.setRemoteDescription(offer);
        adoptOfferedVideo(pc);
        await drainCandidates();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (!stillOurs()) return;
        send("call_accepted", {});
        send("answer", { sdp: answer });
        // The answer does not wait for the camera: it joins as soon as it is ready.
        if (withVideo) void startCameraRef.current?.(undefined, true);
      } catch (err) {
        if (!stillOurs()) return;
        send("call_rejected", { reason: "error" });
        finishWithError(classifyMediaError(err));
      }
    },
    [store, authorize, createPeer, attachLocalMedia, adoptOfferedVideo, drainCandidates, send, finishWithError],
  );

  const reject = useCallback(() => {
    send("call_rejected", { reason: "declined" });
    updateSession({ status: "rejected", ended_at: new Date().toISOString(), end_reason: "declined" });
    teardown();
    store.getState().reset();
  }, [send, updateSession, teardown, store]);

  const hangUp = useCallback(() => {
    const s = store.getState().state;
    if (s === "calling" || s === "ringing") {
      send("call_cancelled", { reason: "cancelled" });
      updateSession({ status: "cancelled", ended_at: new Date().toISOString(), end_reason: "cancelled" });
    } else {
      send("call_ended", { reason: "hangup" });
      updateSession({ status: "ended", ended_at: new Date().toISOString(), end_reason: "hangup" });
    }
    postOutcome(); // completed if it connected, else cancelled
    finish("ended");
  }, [store, send, updateSession, finish, postOutcome]);

  const toggleMute = useCallback(() => {
    const next = !store.getState().muted;
    // enabled=false keeps the track/connection alive — no renegotiation. Before
    // the microphone is open this only records the choice; attachLocalMedia
    // applies it to the track when it arrives.
    for (const track of localStreamRef.current?.getAudioTracks() ?? []) track.enabled = !next;
    store.getState().setMuted(next);
    broadcastMediaState();
  }, [store, broadcastMediaState]);

  /** Close the closing screen now instead of waiting for it to go by itself. */
  const dismiss = useCallback(() => {
    if (!isCallOver(store.getState().state)) return;
    if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    resetTimeoutRef.current = null;
    store.getState().reset();
  }, [store]);

  // ---- Camera (video) -------------------------------------------------------

  /** Lets go of the camera in use, and says which one it was. */
  const releaseCamera = useCallback((): CameraChoice | null => {
    const stream = videoStreamRef.current;
    if (!stream) return null;
    const was = stream.getVideoTracks()[0]?.getSettings();
    for (const t of stream.getTracks()) {
      t.onended = null; // we are stopping it ourselves: that is not a lost camera
      t.stop();
    }
    videoStreamRef.current = null;
    if (was?.deviceId) return { deviceId: was.deviceId };
    return { facing: was?.facingMode === "environment" ? "environment" : "user" };
  }, []);

  /**
   * Turns the camera on, or changes to another one. `cameras` are tried in
   * order; without any, the side used last (the front camera at first).
   * `preAuthorized`: the caller of this function has just checked "video" itself.
   */
  const startCamera = useCallback(
    async (cameras?: CameraChoice[], preAuthorized = false) => {
      const sender = videoSenderRef.current;
      if (!sender) return; // not set up yet (the store's `mediaReady` is still false)
      // One camera change at a time. A tap that lands while one is at work is
      // dropped: two of them racing could leave a camera on behind a screen
      // that says it is off.
      if (cameraBusyRef.current === sender) return;
      cameraBusyRef.current = sender;
      const stops = cameraStopsRef.current;
      // True while this is still the same call and nobody has switched the
      // camera off in the meantime.
      const stillWanted = () =>
        videoSenderRef.current === sender && cameraStopsRef.current === stops;
      try {
        // Video authorization is checked server-side too (never trust the client).
        if (!preAuthorized) {
          const auth = await authorize("video");
          if (!stillWanted()) return;
          if (!auth.ok) {
            store.getState().setCameraError(callErrorMessage(reasonToCode(auth.reason)));
            return;
          }
        }
        const wanted = cameras?.length ? cameras : [{ facing: facingRef.current }];

        // Most phones cannot have two cameras open at once, so the one in use
        // is let go first. If none of the wanted ones opens, we go back to it.
        const previous = releaseCamera();
        let stream: MediaStream | null = null;
        let failure: unknown = null;
        for (const camera of wanted) {
          try {
            stream = await openCamera(camera);
            break;
          } catch (err) {
            failure = failure ?? err;
          }
          if (!stillWanted()) return;
        }
        const changed = stream !== null;
        if (!stream && previous) {
          try {
            stream = await openCamera(previous);
          } catch {
            /* reported below */
          }
        }
        // The call may have ended, or the camera been switched off, while the
        // browser was opening it: let it go again instead of leaving it running.
        if (!stillWanted()) {
          for (const t of stream?.getTracks() ?? []) t.stop();
          return;
        }
        const track = stream?.getVideoTracks()[0];
        if (!stream || !track) {
          // No camera any more. The call itself goes on as a voice call.
          void sender.replaceTrack(null).catch(() => undefined);
          store.getState().setVideoEnabled(false);
          store.getState().setLocalStream(null);
          store
            .getState()
            .setCameraError(
              callErrorMessage(failure ? classifyCameraError(failure) : "CAMERA_UNAVAILABLE"),
            );
          broadcastMediaState();
          return;
        }
        // Camera lost mid-call (unplugged, taken by the system) → keep the call
        // and say so. Only while it is the camera in use.
        const opened = stream;
        track.onended = () => {
          if (videoStreamRef.current === opened) stopCameraRef.current?.("CAMERA_LOST");
        };
        videoStreamRef.current = stream;
        await sender.replaceTrack(track); // no renegotiation (transceiver exists)
        if (!stillWanted()) return; // stopped meanwhile; whoever stopped it let the camera go
        const facing = track.getSettings().facingMode;
        if (facing === "user" || facing === "environment") facingRef.current = facing;
        usedVideoRef.current = true;
        // Back on the camera we came from: the other one did not start.
        store.getState().setCameraError(changed ? null : callErrorMessage("CAMERA_SWITCH_FAILED"));
        store.getState().setVideoEnabled(true);
        store.getState().setLocalStream(stream);
        broadcastMediaState();
      } finally {
        if (cameraBusyRef.current === sender) cameraBusyRef.current = null;
      }
    },
    [authorize, store, broadcastMediaState, releaseCamera],
  );

  const stopCamera = useCallback(
    (reason?: CallErrorCode) => {
      const sender = videoSenderRef.current;
      cameraStopsRef.current++; // a camera that is still being opened is let go when it arrives
      if (sender) void sender.replaceTrack(null).catch(() => undefined);
      releaseCamera();
      store.getState().setVideoEnabled(false);
      store.getState().setLocalStream(null);
      if (reason) store.getState().setCameraError(callErrorMessage(reason));
      broadcastMediaState();
    },
    [store, broadcastMediaState, releaseCamera],
  );
  // expose to earlier-defined callers (periodic auth timer, startCall)
  stopCameraRef.current = stopCamera;
  startCameraRef.current = startCamera;

  const toggleCamera = useCallback(async () => {
    if (store.getState().videoEnabled) stopCamera();
    else await startCamera();
  }, [store, stopCamera, startCamera]);

  /** "Flip": the other side on a phone, the next camera on a computer. */
  const switchCamera = useCallback(async () => {
    const sender = videoSenderRef.current;
    if (!store.getState().videoEnabled || !sender) return;
    if (cameraBusyRef.current === sender) return; // a tap while a change is still at work
    const current = videoStreamRef.current?.getVideoTracks()[0]?.getSettings();

    let others: MediaDeviceInfo[] = [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      others = devices.filter(
        (d) => d.kind === "videoinput" && d.deviceId && d.deviceId !== current?.deviceId,
      );
    } catch {
      /* no list: a phone can still be asked for its other side */
    }

    const cameras: CameraChoice[] = [];
    if (current?.facingMode === "user" || current?.facingMode === "environment") {
      // A phone. Ask for the other side and let the browser pick the camera: a
      // phone often has several on the back, and stepping through them one by
      // one lands on the wide or the zoom lens. Should the phone not know its
      // sides, fall back on the cameras whose name says so, then on any other.
      const side = current.facingMode === "user" ? "environment" : "user";
      const named = side === "environment" ? /back|rear|environment/i : /front|user|face/i;
      cameras.push({ facing: side, exactFacing: true });
      for (const d of others) if (named.test(d.label)) cameras.push({ deviceId: d.deviceId });
      for (const d of others) if (!named.test(d.label)) cameras.push({ deviceId: d.deviceId });
    } else {
      // A computer: its cameras do not say which way they face. Take the next one.
      const next = others[0];
      if (next) cameras.push({ deviceId: next.deviceId });
    }
    if (cameras.length === 0) return;
    await startCamera(cameras, true);
  }, [store, startCamera]);

  /** Cycle to the next available audio output device (setSinkId), if supported. */
  const selectOutputDevice = useCallback(async () => {
    const el = remoteAudioRef.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void>; sinkId?: string }) | null;
    if (!el || typeof el.setSinkId !== "function") return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outs = realAudioOutputs(devices);
      if (outs.length < 2) return;
      // Nothing chosen yet means the system default is playing: start from it.
      const currentId = store.getState().outputDeviceId || el.sinkId;
      const systemDefault = devices.find((d) => d.kind === "audiooutput" && d.deviceId === "default");
      const idx = currentId
        ? outs.findIndex((d) => d.deviceId === currentId)
        : outs.findIndex((d) => d.groupId === systemDefault?.groupId);
      const next = outs[(idx + 1) % outs.length]!;
      await el.setSinkId(next.deviceId);
      store.getState().setOutputDevice(next.deviceId);
    } catch {
      /* ignore */
    }
  }, [remoteAudioRef, store]);

  /** Replace the mic track without renegotiation (device change / selection). */
  const replaceMic = useCallback(async (deviceId?: string) => {
    const sender = senderRef.current;
    if (!sender) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia(audioConstraints(deviceId));
      const [track] = stream.getAudioTracks();
      if (!track) return;
      track.enabled = !store.getState().muted;
      await sender.replaceTrack(track);
      // stop the old track(s), swap the reference, refresh the level monitor
      if (localStreamRef.current) {
        for (const t of localStreamRef.current.getTracks()) t.stop();
      }
      localStreamRef.current = stream;
      audioMonitorRef.current?.stop();
      audioMonitorRef.current = monitorAudioLevel(stream, (sp) => store.getState().setSpeaking(sp));
    } catch {
      /* keep the existing track if the new one can't be opened */
    }
  }, [store]);

  // ---- Signaling wiring -----------------------------------------------------

  /**
   * One message, from the channel of `chatId`. The channels are opened once and
   * call this through a ref, so they always run the current version.
   */
  const onSignal = async (chatId: string, type: SignalType, payload: SignalPayload) => {
    const current = store.getState();

    if (type === "call_started") {
      // Already in a call (with anyone): tell this caller so. A call may still
      // arrive while the closing screen of the last one is up.
      if (current.state !== "idle" && !isCallOver(current.state)) {
        void channelsRef.current
          .get(chatId)
          ?.send("busy", { callId: payload.callId, senderId: me.id });
        return;
      }
      const caller = peopleRef.current.get(chatId);
      if (!caller || !payload.from || !payload.sdp) return;
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
      callIdRef.current = payload.callId;
      activeChatRef.current = chatId;
      incomingOfferRef.current = payload.sdp;
      // Who is calling comes from our own data, not from what the message says:
      // a chat's channel only ever carries calls from the other person in it.
      store.getState().startIncoming(payload.callId, chatId, peerInfo(caller), payload.media);
      return;
    }

    // Everything else belongs to the call in progress, on its own channel.
    if (chatId !== activeChatRef.current || payload.callId !== callIdRef.current) return;

    switch (type) {
      case "offer": {
        // Renegotiation / ICE-restart offer (callee side) on an existing call.
        const pc = pcRef.current;
        if (!pc || !payload.sdp) return;
        try {
          await pc.setRemoteDescription(payload.sdp);
          await drainCandidates();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send("answer", { sdp: answer });
        } catch {
          /* recovery will retry */
        }
        break;
      }
      case "answer": {
        const pc = pcRef.current;
        if (!pc || !payload.sdp) return;
        try {
          await pc.setRemoteDescription(payload.sdp);
          await drainCandidates();
          if (store.getState().state === "calling") store.getState().setState("connecting");
        } catch {
          /* ignore */
        }
        break;
      }
      case "call_accepted":
        if (current.state === "calling") store.getState().setState("connecting");
        break;
      case "ice_candidate": {
        if (!payload.candidate) return;
        const pc = pcRef.current;
        if (pc && pc.remoteDescription) {
          try {
            await pc.addIceCandidate(payload.candidate);
          } catch {
            /* ignore */
          }
        } else {
          pendingCandidatesRef.current.push(payload.candidate);
        }
        break;
      }
      case "call_rejected":
        postOutcome("declined");
        finish("rejected");
        break;
      case "busy":
        // They are talking to someone else. Leave a "missed call" in the chat,
        // so they see afterwards that we tried.
        postOutcome("missed");
        finish("busy");
        break;
      case "call_cancelled":
        // The caller gave up. Say so for a moment instead of just vanishing.
        finish("ended", current.state === "ringing" ? "Missed call" : undefined);
        break;
      case "call_ended":
        postOutcome(); // caller posts completed/cancelled; callee is a no-op
        finish("ended");
        break;
      case "media_state":
        if (payload.media) store.getState().setRemoteMedia(payload.media);
        break;
    }
  };
  const onSignalRef = useRef(onSignal);
  onSignalRef.current = onSignal;

  // Listen on the channel of every chat. Channels open and close as the list
  // changes (someone is added or removed); the one a call is running on is
  // never closed under it.
  const chatIds = chats
    .map((c) => c.chatId)
    .sort()
    .join(",");
  useEffect(() => {
    const wanted = new Set(chatIds ? chatIds.split(",") : []);
    const channels = channelsRef.current;
    for (const [id, channel] of channels) {
      if (wanted.has(id) || id === activeChatRef.current) continue;
      channels.delete(id);
      void channel.disconnect();
    }
    for (const id of wanted) {
      if (channels.has(id)) continue;
      const channel = new SignalingChannel(id);
      channel.onSignal((type, payload) => void onSignalRef.current(id, type, payload));
      channels.set(id, channel);
      void channel.connect();
    }
  }, [chatIds]);

  // Leaving the app: end whatever is running, tell the other side, stop listening.
  useEffect(() => {
    const channels = channelsRef.current;
    return () => {
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
      const state = store.getState().state;
      const callId = callIdRef.current;
      const chatId = activeChatRef.current;
      let goodbye: Promise<void> | undefined;
      if (callId && chatId && state !== "idle" && !isCallOver(state)) {
        const wasTalking = state === "connected" || state === "reconnecting";
        const parting = wasTalking
          ? "call_ended"
          : state === "ringing"
            ? "call_rejected"
            : "call_cancelled";
        goodbye = channels.get(chatId)?.send(parting, { callId, senderId: me.id, reason: "left" });
        postOutcome();
      }
      teardown();
      store.getState().reset();
      // The goodbye has to leave before its channel is closed.
      const closing = [...channels.values()];
      channels.clear();
      void Promise.resolve(goodbye)
        .catch(() => undefined)
        .then(() => {
          for (const channel of closing) void channel.disconnect();
        });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Browser lifecycle & network transitions ------------------------------

  useEffect(() => {
    const active = () => {
      const s = store.getState().state;
      return s !== "idle" && s !== "ended" && s !== "failed" && s !== "rejected" && s !== "busy";
    };
    const onLeave = () => {
      if (callIdRef.current && active()) {
        send(store.getState().state === "connected" ? "call_ended" : "call_cancelled", { reason: "left" });
      }
    };
    const onOnline = () => {
      // navigator.onLine is only a hint; the pc state is authoritative. Nudge a
      // recovery attempt if we're mid-drop.
      const s = store.getState().state;
      if (s === "reconnecting" || s === "disconnected") {
        clearReconnect();
        enterReconnecting();
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") onOnline();
    };

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (active()) {
        e.preventDefault();
        e.returnValue = ""; // triggers the browser's "leave site?" confirmation
      }
    };

    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("online", onOnline);
    window.addEventListener("pageshow", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pageshow", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [send, store, clearReconnect, enterReconnecting]);

  // ---- Device changes (mic disconnect/reconnect) ----------------------------

  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md || typeof md.addEventListener !== "function") return;
    const onChange = () => {
      const track = localStreamRef.current?.getAudioTracks()[0];
      const s = store.getState().state;
      const inCall = s === "connected" || s === "connecting" || s === "reconnecting";
      // If our mic vanished mid-call, transparently re-acquire the default one.
      if (inCall && (!track || track.readyState === "ended")) {
        void replaceMic();
      }
    };
    md.addEventListener("devicechange", onChange);
    return () => md.removeEventListener("devicechange", onChange);
  }, [replaceMic, store]);

  return {
    startCall,
    accept,
    reject,
    hangUp,
    dismiss,
    toggleMute,
    toggleCamera,
    switchCamera,
    selectOutputDevice,
    replaceMic,
  };
}
