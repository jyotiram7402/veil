"use client";

import { useCallback, useEffect, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCallStore } from "@/store/call-store";
import { basicRtcConfig, getRtcConfig, isWebRtcSupported } from "@/lib/webrtc/ice";
import {
  audioConstraints,
  keepResolution,
  preferOpus,
  relaxedVideoConstraints,
  videoConstraints,
  type CameraChoice,
} from "@/lib/webrtc/codec";
import { createVideoGovernor } from "@/lib/webrtc/video-governor";
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
  MAX_RING_MS,
  RING_AFTER_REACHED_MS,
  RING_REPEAT_MS,
  RING_SILENCE_MS,
  isCallOver,
  type PeerInfo,
  type SignalPayload,
  type SignalType,
} from "@/lib/webrtc/types";
import type { Profile } from "@/types/chat";
import type { Database } from "@/types/database";

type Person = Pick<Profile, "id" | "username" | "display_name" | "avatar_url">;

export type CallChat = { chatId: string; other: Person };

type UseCallArgs = {
  me: Profile;
  chats: CallChat[];
  remoteAudioRef: React.RefObject<HTMLAudioElement | null>;
};

const RECONNECT_DELAYS = [1500, 3000, 6000];
const MAX_RECONNECT = RECONNECT_DELAYS.length;
const DISCONNECT_GRACE_MS = 2000;
const CONNECT_TIMEOUT_MS = 30_000;
const ENDED_LINGER_MS = 2500;

const CAMERA_RELEASE_MS = 400;
const REMEMBERED_CALLS = 20;

function offerSoFar(
  pc: RTCPeerConnection,
  fallback: RTCSessionDescriptionInit,
): RTCSessionDescriptionInit {
  const local = pc.localDescription;
  return local ? { type: local.type, sdp: local.sdp } : fallback;
}

function cameraIsBusy(err: unknown): boolean {
  return (
    err instanceof DOMException && (err.name === "NotReadableError" || err.name === "AbortError")
  );
}

async function openCamera(camera: CameraChoice): Promise<MediaStream> {
  const open = async () => {
    try {
      return await navigator.mediaDevices.getUserMedia(videoConstraints(camera));
    } catch {
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

export function useCall({ me, chats, remoteAudioRef }: UseCallArgs) {
  const store = useCallStore;
  const peopleRef = useRef(new Map<string, Person>());
  peopleRef.current = new Map(chats.map((c) => [c.chatId, c.other]));

  const channelsRef = useRef(new Map<string, SignalingChannel>());
  const activeChatRef = useRef<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const senderRef = useRef<RTCRtpSender | null>(null);
  const videoSenderRef = useRef<RTCRtpSender | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const facingRef = useRef<"user" | "environment">("user");
  const usedVideoRef = useRef(false);
  const callIdRef = useRef<string | null>(null);
  const incomingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ringRepeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringWatchRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringStartedAtRef = useRef(0);
  const ringDeadlineRef = useRef(0);
  const heardCallerAtRef = useRef(0);
  const callerRepeatsRef = useRef(false);
  const endedCallsRef = useRef(new Set<string>());
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const cameraBusyRef = useRef<RTCRtpSender | null>(null);
  const cameraStopsRef = useRef(0);
  const samplerRef = useRef<ReturnType<typeof createQualitySampler> | null>(null);
  const governorRef = useRef(createVideoGovernor());
  const tuningRef = useRef<Promise<void>>(Promise.resolve());
  const audioMonitorRef = useRef<AudioLevelMonitor | null>(null);

  const send = useCallback(
    (type: SignalType, extra: Partial<SignalPayload> = {}) => {
      const callId = callIdRef.current;
      const chatId = activeChatRef.current;
      if (!callId || !chatId) return;
      void channelsRef.current.get(chatId)?.send(type, { callId, senderId: me.id, ...extra });
    },
    [me.id],
  );

  const updateSession = useCallback((patch: Database["public"]["Tables"]["call_sessions"]["Update"]) => {
    const callId = callIdRef.current;
    if (!callId) return;
    void supabaseBrowser().from("call_sessions").update(patch).eq("id", callId).then(
      () => undefined,
      () => undefined,
    );
  }, []);

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

  const tuneVideo = useCallback(() => {
    const sender = videoSenderRef.current;
    const scale = governorRef.current.scale();
    tuningRef.current = tuningRef.current.then(() => keepResolution(sender, scale));
  }, []);

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
    store.getState().setVideoNumbers(null, null);
  }, [store]);

  const startMonitors = useCallback(() => {
    if (!statsTimerRef.current) {
      samplerRef.current = createQualitySampler();
      statsTimerRef.current = setInterval(async () => {
        const pc = pcRef.current;
        const sampler = samplerRef.current;
        if (!pc || !sampler) return;
        const s = await sampler(pc);
        if (pcRef.current !== pc) return;
        const now = store.getState();
        now.setQuality(s.quality);
        now.setRelayed(s.relayed);
        const sent = now.videoEnabled ? s.video.sent : null;
        now.setVideoNumbers(sent, now.remoteVideoOn ? s.video.received : null);
        const scale = governorRef.current.next(
          sent ? { fps: sent.fps, cameraFps: s.video.cameraFps, limited: sent.limited } : null,
        );
        if (scale !== null) tuneVideo();
      }, STATS_INTERVAL_MS);
    }
    if (!audioMonitorRef.current && localStreamRef.current) {
      audioMonitorRef.current = monitorAudioLevel(localStreamRef.current, (speaking) =>
        store.getState().setSpeaking(speaking),
      );
    }
  }, [store, tuneVideo]);

  const clearReconnect = useCallback(() => {
    if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    disconnectTimerRef.current = null;
    reconnectTimerRef.current = null;
  }, []);

  const teardown = useCallback(() => {
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
    ringTimeoutRef.current = null;
    if (ringRepeatRef.current) clearInterval(ringRepeatRef.current);
    ringRepeatRef.current = null;
    if (ringWatchRef.current) clearInterval(ringWatchRef.current);
    ringWatchRef.current = null;
    callerRepeatsRef.current = false;
    if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
    connectTimeoutRef.current = null;
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
      } catch {}
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
    facingRef.current = "user";
    cameraStopsRef.current++;
    governorRef.current.reset();
    remoteStreamRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    incomingOfferRef.current = null;
    pendingCandidatesRef.current = [];
    const ended = callIdRef.current;
    if (ended) {
      const remembered = endedCallsRef.current;
      remembered.add(ended);
      const oldest = remembered.values().next().value;
      if (remembered.size > REMEMBERED_CALLS && oldest) remembered.delete(oldest);
    }
    callIdRef.current = null;
    activeChatRef.current = null;
  }, [clearReconnect, stopMonitors, remoteAudioRef]);

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

  const ringUntil = useCallback(
    (deadline: number) => {
      const callId = callIdRef.current;
      if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
      ringDeadlineRef.current = deadline;
      ringTimeoutRef.current = setTimeout(() => {
        ringTimeoutRef.current = null;
        if (callIdRef.current !== callId || store.getState().state !== "calling") return;
        send("call_cancelled", { reason: "no answer" });
        updateSession({ status: "missed", ended_at: new Date().toISOString(), end_reason: "no answer" });
        postOutcome("missed");
        finish("ended", "No answer");
      }, Math.max(0, deadline - Date.now()));
    },
    [store, send, updateSession, postOutcome, finish],
  );

  const watchCaller = useCallback(() => {
    if (ringWatchRef.current) clearInterval(ringWatchRef.current);
    const callId = callIdRef.current;
    const watch = setInterval(() => {
      if (callIdRef.current !== callId || store.getState().state !== "ringing") {
        clearInterval(watch);
        if (ringWatchRef.current === watch) ringWatchRef.current = null;
        return;
      }
      if (document.visibilityState !== "visible") {
        heardCallerAtRef.current = Date.now();
        return;
      }
      if (!callerRepeatsRef.current) return;
      if (Date.now() - heardCallerAtRef.current < RING_SILENCE_MS) return;
      finish("ended", "Missed call");
      if (callId) endedCallsRef.current.delete(callId);
    }, 1000);
    ringWatchRef.current = watch;
  }, [store, finish]);

  const expectConnection = useCallback(() => {
    if (connectTimeoutRef.current) return;
    const callId = callIdRef.current;
    connectTimeoutRef.current = setTimeout(() => {
      connectTimeoutRef.current = null;
      if (callIdRef.current !== callId || store.getState().connectedAt !== null) return;
      send("call_ended", { reason: "unreachable" });
      postOutcome("failed");
      finishWithError("ICE_FAILED");
    }, CONNECT_TIMEOUT_MS);
  }, [store, send, postOutcome, finishWithError]);

  const handleConnUp = useCallback(() => {
    clearReconnect();
    if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
    connectTimeoutRef.current = null;
    reconnectAttemptRef.current = 0;
    store.getState().setReconnectAttempt(0);
    store.getState().setConnected();
    updateSession({ status: "connected", connected_at: new Date().toISOString() });
    startMonitors();
    tuneVideo();
    broadcastMediaState();
    if (!authTimerRef.current) {
      authTimerRef.current = setInterval(async () => {
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
  }, [clearReconnect, store, updateSession, startMonitors, tuneVideo, authorize, finishWithError, broadcastMediaState, postOutcome]);

  const doIceRestart = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || negotiatingRef.current) return;
    negotiatingRef.current = true;
    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      send("offer", { sdp: offer });
    } catch {} finally {
      negotiatingRef.current = false;
    }
  }, [send]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) return;
    const attempt = reconnectAttemptRef.current;
    if (attempt >= MAX_RECONNECT) {
      const everConnected = store.getState().connectedAt !== null;
      postOutcome(everConnected ? undefined : "failed");
      finishWithError(everConnected ? "RECONNECT_FAILED" : "ICE_FAILED");
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
      const auth = await authorize();
      if (!auth.ok) {
        postOutcome();
        finishWithError(reasonToCode(auth.reason));
        return;
      }
      reconnectAttemptRef.current = attempt + 1;
      store.getState().setReconnectAttempt(attempt + 1);
      if (store.getState().isCaller) await doIceRestart();
      scheduleReconnect();
    }, delay);
  }, [authorize, doIceRestart, finishWithError, handleConnUp, store, postOutcome]);

  const enterReconnecting = useCallback(() => {
    const s = store.getState().state;
    if (s === "idle" || s === "ended" || s === "failed" || s === "rejected" || s === "busy") return;
    if (store.getState().connectedAt !== null) store.getState().setState("reconnecting");
    scheduleReconnect();
  }, [store, scheduleReconnect]);

  const applySinkId = useCallback(() => {
    const el = remoteAudioRef.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    const id = store.getState().outputDeviceId;
    if (el && id && typeof el.setSinkId === "function") {
      void el.setSinkId(id).catch(() => undefined);
    }
  }, [remoteAudioRef, store]);

  const createPeer = useCallback((config: RTCConfiguration) => {
    let pc: RTCPeerConnection;
    try {
      pc = new RTCPeerConnection(config);
    } catch {
      pc = new RTCPeerConnection(basicRtcConfig());
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) send("ice_candidate", { candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();
      const remote = remoteStreamRef.current;
      if (!remote.getTracks().some((t) => t.id === e.track.id)) remote.addTrack(e.track);
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remote;
        applySinkId();
        void remoteAudioRef.current.play().catch(() => undefined);
      }
      store.getState().setRemoteStream(remote);
    };
    pc.onconnectionstatechange = () => {
      switch (pc.connectionState) {
        case "connected":
          handleConnUp();
          break;
        case "disconnected":
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
        track.enabled = !store.getState().muted;
        senderRef.current = pc.addTrack(track, stream);
        const audioTx = pc.getTransceivers().find((t) => t.sender === senderRef.current);
        preferOpus(audioTx);
      }
      if (role === "caller") {
        videoSenderRef.current = pc.addTransceiver("video", { direction: "sendrecv" }).sender;
        tuneVideo();
        store.getState().setMediaReady(true);
      }
      return true;
    },
    [store, tuneVideo],
  );

  const adoptOfferedVideo = useCallback(
    (pc: RTCPeerConnection) => {
      const offered = pc
        .getTransceivers()
        .find((t) => t.mid !== null && t.receiver.track.kind === "video");
      if (offered) offered.direction = "sendrecv";
      videoSenderRef.current = offered?.sender ?? null;
      tuneVideo();
      store.getState().setMediaReady(!!offered);
    },
    [store, tuneVideo],
  );

  const drainCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    const pending = pendingCandidatesRef.current;
    pendingCandidatesRef.current = [];
    for (const c of pending) {
      try {
        await pc.addIceCandidate(c);
      } catch {}
    }
  }, []);

  const startCall = useCallback(
    async (chatId: string, withVideo = false) => {
      const other = peopleRef.current.get(chatId);
      if (!other) return;
      if (store.getState().state !== "idle") return;

      const callId = crypto.randomUUID();
      callIdRef.current = callId;
      activeChatRef.current = chatId;
      usedVideoRef.current = false;
      store.getState().startOutgoing(callId, chatId, peerInfo(other));
      const stillOurs = () => callIdRef.current === callId;

      if (!isWebRtcSupported()) {
        finishWithError("UNSUPPORTED");
        return;
      }
      const [auth, rtcConfig] = await Promise.all([
        authorize(withVideo ? "video" : "voice"),
        getRtcConfig(chatId),
      ]);
      if (!stillOurs()) return;
      if (!auth.ok) {
        finishWithError(reasonToCode(auth.reason));
        return;
      }

      try {
        const pc = createPeer(rtcConfig);
        if (!(await attachLocalMedia(pc, "caller"))) return;
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
        void fetch(`/api/calls/${callId}/ring`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, kind: withVideo ? "video" : "voice" }),
        }).catch(() => undefined);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (!stillOurs()) return;
        const ring = (type: "call_started" | "call_ring") =>
          send(type, {
            from: peerInfo(me),
            sdp: offerSoFar(pc, offer),
            media: { audio: !store.getState().muted, video: store.getState().videoEnabled },
          });
        ring("call_started");
        ringStartedAtRef.current = Date.now();
        ringUntil(ringStartedAtRef.current + CALL_RING_TIMEOUT_MS);
        const repeat = setInterval(() => {
          if (callIdRef.current !== callId || store.getState().state !== "calling") {
            clearInterval(repeat);
            if (ringRepeatRef.current === repeat) ringRepeatRef.current = null;
            return;
          }
          ring("call_ring");
        }, RING_REPEAT_MS);
        ringRepeatRef.current = repeat;
      } catch (err) {
        if (!stillOurs()) return;
        send("call_cancelled", { reason: "error" });
        postOutcome("failed");
        finishWithError(classifyMediaError(err));
      }
    },
    [store, me, authorize, createPeer, attachLocalMedia, send, ringUntil, finishWithError, postOutcome],
  );

  const accept = useCallback(
    async (withVideo = false) => {
      const offer = incomingOfferRef.current;
      const callId = callIdRef.current;
      const chatId = activeChatRef.current;
      if (!offer || !callId || !chatId || store.getState().state !== "ringing") return;
      const stillOurs = () => callIdRef.current === callId;

      store.getState().setState("connecting");
      const [auth, rtcConfig] = await Promise.all([
        authorize(withVideo ? "video" : "voice"),
        getRtcConfig(chatId),
      ]);
      if (!stillOurs()) return;
      if (!auth.ok) {
        send("call_rejected", { reason: "unauthorized" });
        finishWithError(reasonToCode(auth.reason));
        return;
      }

      try {
        const pc = createPeer(rtcConfig);
        if (!(await attachLocalMedia(pc, "callee"))) return;
        await pc.setRemoteDescription(offer);
        adoptOfferedVideo(pc);
        await drainCandidates();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (!stillOurs()) return;
        send("call_accepted", {});
        send("answer", { sdp: answer });
        expectConnection();
        if (withVideo) void startCameraRef.current?.(undefined, true);
      } catch (err) {
        if (!stillOurs()) return;
        send("call_rejected", { reason: "error" });
        finishWithError(classifyMediaError(err));
      }
    },
    [store, authorize, createPeer, attachLocalMedia, adoptOfferedVideo, drainCandidates, send, finishWithError, expectConnection],
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
    postOutcome();
    finish("ended");
  }, [store, send, updateSession, finish, postOutcome]);

  const toggleMute = useCallback(() => {
    const next = !store.getState().muted;
    for (const track of localStreamRef.current?.getAudioTracks() ?? []) track.enabled = !next;
    store.getState().setMuted(next);
    broadcastMediaState();
  }, [store, broadcastMediaState]);

  const dismiss = useCallback(() => {
    if (!isCallOver(store.getState().state)) return;
    if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    resetTimeoutRef.current = null;
    store.getState().reset();
  }, [store]);

  const releaseCamera = useCallback((): CameraChoice | null => {
    const stream = videoStreamRef.current;
    if (!stream) return null;
    const was = stream.getVideoTracks()[0]?.getSettings();
    for (const t of stream.getTracks()) {
      t.onended = null;
      t.stop();
    }
    videoStreamRef.current = null;
    if (was?.deviceId) return { deviceId: was.deviceId };
    return { facing: was?.facingMode === "environment" ? "environment" : "user" };
  }, []);

  const startCamera = useCallback(
    async (cameras?: CameraChoice[], preAuthorized = false) => {
      const sender = videoSenderRef.current;
      if (!sender) return;
      if (cameraBusyRef.current === sender) return;
      cameraBusyRef.current = sender;
      const stops = cameraStopsRef.current;
      const stillWanted = () =>
        videoSenderRef.current === sender && cameraStopsRef.current === stops;
      try {
        if (!preAuthorized) {
          const auth = await authorize("video");
          if (!stillWanted()) return;
          if (!auth.ok) {
            store.getState().setCameraError(callErrorMessage(reasonToCode(auth.reason)));
            return;
          }
        }
        const wanted = cameras?.length ? cameras : [{ facing: facingRef.current }];

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
          } catch {}
        }
        if (!stillWanted()) {
          for (const t of stream?.getTracks() ?? []) t.stop();
          return;
        }
        const track = stream?.getVideoTracks()[0];
        if (!stream || !track) {
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
        const opened = stream;
        track.onended = () => {
          if (videoStreamRef.current === opened) stopCameraRef.current?.("CAMERA_LOST");
        };
        videoStreamRef.current = stream;
        await sender.replaceTrack(track);
        if (!stillWanted()) return;
        tuneVideo();
        const facing = track.getSettings().facingMode;
        if (facing === "user" || facing === "environment") facingRef.current = facing;
        usedVideoRef.current = true;
        store.getState().setCameraError(changed ? null : callErrorMessage("CAMERA_SWITCH_FAILED"));
        store.getState().setVideoEnabled(true);
        store.getState().setLocalStream(stream);
        broadcastMediaState();
      } finally {
        if (cameraBusyRef.current === sender) cameraBusyRef.current = null;
      }
    },
    [authorize, store, broadcastMediaState, releaseCamera, tuneVideo],
  );

  const stopCamera = useCallback(
    (reason?: CallErrorCode) => {
      const sender = videoSenderRef.current;
      cameraStopsRef.current++;
      if (sender) void sender.replaceTrack(null).catch(() => undefined);
      releaseCamera();
      store.getState().setVideoEnabled(false);
      store.getState().setLocalStream(null);
      if (reason) store.getState().setCameraError(callErrorMessage(reason));
      broadcastMediaState();
    },
    [store, broadcastMediaState, releaseCamera],
  );
  stopCameraRef.current = stopCamera;
  startCameraRef.current = startCamera;

  const toggleCamera = useCallback(async () => {
    if (store.getState().videoEnabled) stopCamera();
    else await startCamera();
  }, [store, stopCamera, startCamera]);

  const switchCamera = useCallback(async () => {
    const sender = videoSenderRef.current;
    if (!store.getState().videoEnabled || !sender) return;
    if (cameraBusyRef.current === sender) return;
    const current = videoStreamRef.current?.getVideoTracks()[0]?.getSettings();

    let others: MediaDeviceInfo[] = [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      others = devices.filter(
        (d) => d.kind === "videoinput" && d.deviceId && d.deviceId !== current?.deviceId,
      );
    } catch {}

    const cameras: CameraChoice[] = [];
    if (current?.facingMode === "user" || current?.facingMode === "environment") {
      const side = current.facingMode === "user" ? "environment" : "user";
      const named = side === "environment" ? /back|rear|environment/i : /front|user|face/i;
      cameras.push({ facing: side, exactFacing: true });
      for (const d of others) if (named.test(d.label)) cameras.push({ deviceId: d.deviceId });
      for (const d of others) if (!named.test(d.label)) cameras.push({ deviceId: d.deviceId });
    } else {
      const next = others[0];
      if (next) cameras.push({ deviceId: next.deviceId });
    }
    if (cameras.length === 0) return;
    await startCamera(cameras, true);
  }, [store, startCamera]);

  const selectOutputDevice = useCallback(async () => {
    const el = remoteAudioRef.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void>; sinkId?: string }) | null;
    if (!el || typeof el.setSinkId !== "function") return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outs = realAudioOutputs(devices);
      if (outs.length < 2) return;
      const currentId = store.getState().outputDeviceId || el.sinkId;
      const systemDefault = devices.find((d) => d.kind === "audiooutput" && d.deviceId === "default");
      const idx = currentId
        ? outs.findIndex((d) => d.deviceId === currentId)
        : outs.findIndex((d) => d.groupId === systemDefault?.groupId);
      const next = outs[(idx + 1) % outs.length]!;
      await el.setSinkId(next.deviceId);
      store.getState().setOutputDevice(next.deviceId);
    } catch {}
  }, [remoteAudioRef, store]);

  const replaceMic = useCallback(async (deviceId?: string) => {
    const sender = senderRef.current;
    if (!sender) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia(audioConstraints(deviceId));
      const [track] = stream.getAudioTracks();
      if (!track) return;
      track.enabled = !store.getState().muted;
      await sender.replaceTrack(track);
      if (localStreamRef.current) {
        for (const t of localStreamRef.current.getTracks()) t.stop();
      }
      localStreamRef.current = stream;
      audioMonitorRef.current?.stop();
      audioMonitorRef.current = monitorAudioLevel(stream, (sp) => store.getState().setSpeaking(sp));
    } catch {}
  }, [store]);

  const onSignal = async (chatId: string, type: SignalType, payload: SignalPayload) => {
    const current = store.getState();

    if (type === "call_started" || type === "call_ring") {
      if (payload.senderId === me.id || endedCallsRef.current.has(payload.callId)) return;
      const inCall = current.state !== "idle" && !isCallOver(current.state);
      if (inCall && chatId === activeChatRef.current && payload.callId === callIdRef.current) {
        if (current.state !== "ringing") return;
        heardCallerAtRef.current = Date.now();
        if (type === "call_ring") callerRepeatsRef.current = true;
        if (payload.sdp) incomingOfferRef.current = payload.sdp;
        if (payload.media) store.getState().setRemoteMedia(payload.media);
        return;
      }
      if (inCall) {
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
      store.getState().startIncoming(payload.callId, chatId, peerInfo(caller), payload.media);
      heardCallerAtRef.current = Date.now();
      callerRepeatsRef.current = type === "call_ring";
      watchCaller();
      send("call_ringing");
      void getRtcConfig(chatId);
      return;
    }

    if (chatId !== activeChatRef.current || payload.callId !== callIdRef.current) return;

    if (payload.senderId === me.id) {
      const elsewhere = type === "call_accepted" || type === "call_rejected" || type === "busy";
      if (elsewhere && current.state === "ringing") {
        teardown();
        store.getState().reset();
      }
      return;
    }

    switch (type) {
      case "call_ringing": {
        if (current.state !== "calling" || !current.isCaller) break;
        if (!current.reached) store.getState().setReached();
        const wanted = Math.min(
          Date.now() + RING_AFTER_REACHED_MS,
          ringStartedAtRef.current + MAX_RING_MS,
        );
        if (wanted > ringDeadlineRef.current) ringUntil(wanted);
        break;
      }
      case "offer": {
        const pc = pcRef.current;
        if (!pc || !payload.sdp) return;
        try {
          await pc.setRemoteDescription(payload.sdp);
          await drainCandidates();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send("answer", { sdp: answer });
        } catch {}
        break;
      }
      case "answer": {
        const pc = pcRef.current;
        if (!pc || !payload.sdp) return;
        try {
          await pc.setRemoteDescription(payload.sdp);
          await drainCandidates();
          if (store.getState().state === "calling") store.getState().setState("connecting");
          expectConnection();
        } catch {}
        break;
      }
      case "call_accepted":
        if (current.state === "calling") store.getState().setState("connecting");
        expectConnection();
        break;
      case "ice_candidate": {
        if (!payload.candidate) return;
        const pc = pcRef.current;
        if (pc && pc.remoteDescription) {
          try {
            await pc.addIceCandidate(payload.candidate);
          } catch {}
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
        postOutcome("missed");
        finish("busy");
        break;
      case "call_cancelled":
        finish("ended", current.state === "ringing" ? "Missed call" : undefined);
        break;
      case "call_ended":
        if (payload.reason === "unreachable" && current.connectedAt === null) {
          postOutcome("failed");
          finishWithError("ICE_FAILED");
          break;
        }
        postOutcome();
        finish("ended");
        break;
      case "media_state":
        if (payload.media) store.getState().setRemoteMedia(payload.media);
        break;
    }
  };
  const onSignalRef = useRef(onSignal);
  onSignalRef.current = onSignal;

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
      const closing = [...channels.values()];
      channels.clear();
      void Promise.resolve(goodbye)
        .catch(() => undefined)
        .then(() => {
          for (const channel of closing) void channel.disconnect();
        });
    };
  }, []);

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
        e.returnValue = "";
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

  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md || typeof md.addEventListener !== "function") return;
    const onChange = () => {
      const track = localStreamRef.current?.getAudioTracks()[0];
      const s = store.getState().state;
      const inCall = s === "connected" || s === "connecting" || s === "reconnecting";
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
