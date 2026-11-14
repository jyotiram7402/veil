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

type UseCallArgs = {
  chatId: string;
  me: Profile;
  other: Pick<Profile, "id" | "username" | "display_name" | "avatar_url">;
  remoteAudioRef: React.RefObject<HTMLAudioElement | null>;
};

const RECONNECT_DELAYS = [1500, 3000, 6000];
const MAX_RECONNECT = RECONNECT_DELAYS.length;
const DISCONNECT_GRACE_MS = 2000;
// How long a closing screen ("Call ended", "No answer") stays up before the
// call UI goes away by itself. An error does not go by itself: it says what to
// do, so it stays until it is closed.
const ENDED_LINGER_MS = 2500;

function peerInfo(p: Pick<Profile, "id" | "username" | "display_name" | "avatar_url">): PeerInfo {
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
 * The 1-to-1 voice-calling engine (quality,
 * monitoring & reconnection). One RTCPeerConnection per call; the signaling
 * channel lives for the whole chat view. All WebRTC lifecycle lives here — UI
 * only reads the store and calls the returned actions.
 */
export function useCall({ chatId, me, other, remoteAudioRef }: UseCallArgs) {
  const store = useCallStore;
  // The signaling handlers below are created once per chat; this keeps them
  // reading the current profile of the other person.
  const otherRef = useRef(other);
  otherRef.current = other;

  const signalingRef = useRef<SignalingChannel | null>(null);
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
    ((deviceId?: string, preAuthorized?: boolean) => Promise<void>) | null
  >(null);
  const samplerRef = useRef<ReturnType<typeof createQualitySampler> | null>(null);
  const audioMonitorRef = useRef<AudioLevelMonitor | null>(null);

  const send = useCallback(
    (type: SignalType, extra: Partial<SignalPayload> = {}) => {
      const callId = callIdRef.current;
      if (!callId) return;
      void signalingRef.current?.send(type, { callId, senderId: me.id, ...extra });
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

  /** Server re-authorization for this chat (membership / room / voice|video). */
  const authorize = useCallback(
    async (feature: "voice" | "video" = "voice"): Promise<{ ok: boolean; reason?: string }> => {
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
    [chatId],
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
      for (const track of videoStreamRef.current.getTracks()) track.stop();
      videoStreamRef.current = null;
    }
    remoteStreamRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    incomingOfferRef.current = null;
    pendingCandidatesRef.current = [];
    callIdRef.current = null;
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
        const voice = await authorize("voice");
        if (!voice.ok) {
          postOutcome();
          finishWithError(reasonToCode(voice.reason));
          return;
        }
        if (store.getState().videoEnabled) {
          const video = await authorize("video");
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
    async (withVideo = false) => {
      if (store.getState().state !== "idle") return; // double-call protection

      const callId = crypto.randomUUID();
      callIdRef.current = callId;
      usedVideoRef.current = false;
      // Open the call screen at once: the steps below can each take a moment,
      // and any of them failing needs a screen to say so.
      store.getState().startOutgoing(callId, peerInfo(other));
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
    [store, other, me, chatId, authorize, createPeer, attachLocalMedia, send, updateSession, finish, finishWithError, postOutcome],
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

  const startCamera = useCallback(
    // `preAuthorized`: the caller of this function has just checked "video" itself.
    async (deviceId?: string, preAuthorized = false) => {
      const sender = videoSenderRef.current;
      if (!sender) return; // not set up yet (the store's `mediaReady` is still false)
      // Video authorization is checked server-side too (never trust the client).
      if (!preAuthorized) {
        const auth = await authorize("video");
        if (!auth.ok) {
          store.getState().setCameraError(callErrorMessage(reasonToCode(auth.reason)));
          return;
        }
      }
      // True while this is still the same call on the same connection.
      const stillOurs = () => videoSenderRef.current === sender;
      const opts = deviceId ? { deviceId } : { facingMode: facingRef.current };
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(videoConstraints(opts));
      } catch {
        // 720p (or the exact device) unavailable → relax rather than fail.
        try {
          stream = await navigator.mediaDevices.getUserMedia(relaxedVideoConstraints(opts));
        } catch (err) {
          if (stillOurs()) store.getState().setCameraError(callErrorMessage(classifyCameraError(err)));
          return;
        }
      }
      // The call may have ended while the browser was asking for the camera:
      // switch it off again instead of leaving it running with no call.
      if (!stillOurs()) {
        for (const t of stream.getTracks()) t.stop();
        return;
      }
      const [track] = stream.getVideoTracks();
      if (!track) {
        store.getState().setCameraError(callErrorMessage("CAMERA_UNAVAILABLE"));
        return;
      }
      // Camera lost mid-call (unplugged / OS revoked) → keep voice, surface it.
      track.onended = () => stopCameraRef.current?.("CAMERA_UNAVAILABLE");
      await sender.replaceTrack(track); // no renegotiation (transceiver exists)
      if (videoStreamRef.current) for (const t of videoStreamRef.current.getTracks()) t.stop();
      videoStreamRef.current = stream;
      usedVideoRef.current = true;
      store.getState().setCameraError(null);
      store.getState().setVideoEnabled(true);
      store.getState().setLocalStream(stream);
      broadcastMediaState();
    },
    [authorize, store, broadcastMediaState],
  );

  const stopCamera = useCallback(
    (reason?: CallErrorCode) => {
      const sender = videoSenderRef.current;
      if (sender) void sender.replaceTrack(null).catch(() => undefined);
      if (videoStreamRef.current) {
        for (const t of videoStreamRef.current.getTracks()) t.stop();
        videoStreamRef.current = null;
      }
      store.getState().setVideoEnabled(false);
      store.getState().setLocalStream(null);
      if (reason) store.getState().setCameraError(callErrorMessage(reason));
      broadcastMediaState();
    },
    [store, broadcastMediaState],
  );
  // expose to earlier-defined callers (periodic auth timer, startCall)
  stopCameraRef.current = stopCamera;
  startCameraRef.current = startCamera;

  const toggleCamera = useCallback(async () => {
    if (store.getState().videoEnabled) stopCamera();
    else await startCamera();
  }, [store, stopCamera, startCamera]);

  const switchCamera = useCallback(async () => {
    if (!store.getState().videoEnabled) return;
    if (!videoSenderRef.current) return;
    let deviceId: string | undefined;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === "videoinput");
      if (cams.length >= 2) {
        const current = videoStreamRef.current?.getVideoTracks()[0]?.getSettings().deviceId;
        const idx = cams.findIndex((c) => c.deviceId === current);
        deviceId = cams[(idx + 1) % cams.length]?.deviceId;
      } else {
        facingRef.current = facingRef.current === "user" ? "environment" : "user";
      }
    } catch {
      facingRef.current = facingRef.current === "user" ? "environment" : "user";
    }
    await startCamera(deviceId);
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

  useEffect(() => {
    const channel = new SignalingChannel(chatId);
    signalingRef.current = channel;

    channel.onSignal(async (type, payload) => {
      const current = store.getState();
      switch (type) {
        case "call_started": {
          // A call may arrive while the closing screen of the last one is still up.
          if (current.state !== "idle" && !isCallOver(current.state)) {
            void channel.send("busy", { callId: payload.callId, senderId: me.id });
            return;
          }
          if (!payload.from || !payload.sdp) return;
          if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
          resetTimeoutRef.current = null;
          callIdRef.current = payload.callId;
          incomingOfferRef.current = payload.sdp;
          // Who is calling comes from our own data, not from what the message says:
          // this channel only ever carries calls from the other person in this chat.
          store.getState().startIncoming(payload.callId, peerInfo(otherRef.current), payload.media);
          break;
        }
        case "offer": {
          // Renegotiation / ICE-restart offer (callee side) on an existing call.
          if (payload.callId !== callIdRef.current || !payload.sdp) return;
          const pc = pcRef.current;
          if (!pc) return;
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
          if (payload.callId !== callIdRef.current || !payload.sdp) return;
          const pc = pcRef.current;
          if (!pc) return;
          try {
            await pc.setRemoteDescription(payload.sdp);
            await drainCandidates();
            if (store.getState().state === "calling") store.getState().setState("connecting");
          } catch {
            /* ignore */
          }
          break;
        }
        case "call_accepted": {
          if (payload.callId === callIdRef.current && current.state === "calling") {
            store.getState().setState("connecting");
          }
          break;
        }
        case "ice_candidate": {
          if (payload.callId !== callIdRef.current || !payload.candidate) return;
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
          if (payload.callId === callIdRef.current) {
            postOutcome("declined");
            finish("rejected");
          }
          break;
        case "busy":
          if (payload.callId === callIdRef.current) finish("busy");
          break;
        case "call_cancelled":
          if (payload.callId === callIdRef.current) {
            // The caller gave up. Say so for a moment instead of just vanishing.
            finish("ended", current.state === "ringing" ? "Missed call" : undefined);
          }
          break;
        case "call_ended":
          if (payload.callId === callIdRef.current) {
            postOutcome(); // caller posts completed/cancelled; callee is a no-op
            finish("ended");
          }
          break;
        case "media_state":
          if (payload.callId === callIdRef.current && payload.media) {
            store.getState().setRemoteMedia(payload.media);
          }
          break;
      }
    });

    void channel.connect();

    return () => {
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
      teardown();
      void channel.disconnect();
      signalingRef.current = null;
      store.getState().reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

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
