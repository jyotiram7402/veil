"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  SignalLow,
  SwitchCamera,
  Video,
  VideoOff,
  Volume2,
  X,
} from "lucide-react";
import { CallControl } from "@/components/call/call-controls";
import { CallStage } from "@/components/call/call-stage";
import { UserAvatar } from "@/components/chat/user-avatar";
import { useMediaDevices } from "@/hooks/use-media-devices";
import { useCallStore } from "@/store/call-store";
import { useSessionStore } from "@/store/session-store";
import { cameraCount, canChooseAudioOutput, realAudioOutputs } from "@/lib/webrtc/devices";
import { playRingtone } from "@/lib/webrtc/ringtone";
import { isCallOver, type CallState } from "@/lib/webrtc/types";
import { cn } from "@/lib/utils";
import styles from "./call.module.css";

export type CallScreenActions = {
  accept: (withVideo?: boolean) => void;
  reject: () => void;
  hangUp: () => void;
  dismiss: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  switchCamera: () => void;
  selectOutputDevice: () => void;
  onOpenChat?: (chatId: string) => void;
};

function useCallClock(running: boolean, since: number | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running || !since) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running, since]);
  if (!since) return "0:00";
  const total = Math.max(0, Math.floor((now - since) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = (total % 60).toString().padStart(2, "0");
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function statusText(
  state: CallState,
  o: { message: string | null; videoCall: boolean; weak: boolean; reached: boolean },
): string {
  switch (state) {
    case "calling":
      return o.reached ? "Ringing…" : "Calling…";
    case "ringing":
      return o.videoCall ? "Video call" : "Voice call";
    case "connecting":
      return "Connecting…";
    case "reconnecting":
      return "Reconnecting…";
    case "connected":
      return o.weak ? "Weak connection" : "";
    case "rejected":
      return "Call declined";
    case "busy":
      return "On another call";
    case "failed":
      return o.message ?? "The call could not be completed.";
    case "ended":
      return o.message ?? "Call ended";
    default:
      return "";
  }
}

function wouldOpenKeyboard(el: HTMLElement): boolean {
  const typing = el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable;
  return typing && window.matchMedia("(pointer: coarse)").matches;
}

export function CallScreen({
  accept,
  reject,
  hangUp,
  dismiss,
  toggleMute,
  toggleCamera,
  switchCamera,
  selectOutputDevice,
  onOpenChat,
}: CallScreenActions) {
  const call = useCallStore();
  const { state, peer, setMinimized } = call;
  const locked = useSessionStore((s) => s.locked);

  const live = state === "connected" || state === "reconnecting";
  const over = isCallOver(state);
  const incoming = state === "ringing";
  const open = state !== "idle" && !!peer;
  const asPill = open && call.minimized && !incoming && state !== "failed";
  const fullOpen = open && !asPill;

  const duration = useCallClock(live, call.connectedAt);
  const inCall = open && !incoming && !over;
  const devices = useMediaDevices(inCall, call.videoEnabled);
  const outputs = realAudioOutputs(devices);
  const canFlip = inCall && call.videoEnabled && cameraCount(devices) >= 2;
  const canPickOutput = inCall && canChooseAudioOutput() && outputs.length >= 2;

  useEffect(() => {
    if (state !== "ringing") return;
    const ring = playRingtone();
    return () => ring.stop();
  }, [state]);

  const callerName = state === "ringing" ? (peer?.name ?? null) : null;
  useEffect(() => {
    if (!callerName) return;
    const before = document.title;
    const ringing = `${callerName} is calling…`;
    document.title = ringing;
    return () => {
      if (document.title === ringing) document.title = before;
    };
  }, [callerName]);

  const [soundNote, setSoundNote] = useState<string | null>(null);
  const outputsRef = useRef(outputs);
  outputsRef.current = outputs;
  useEffect(() => {
    if (!call.outputDeviceId) return;
    const name = outputsRef.current.find((d) => d.deviceId === call.outputDeviceId)?.label;
    setSoundNote(name ? `Sound: ${name}` : "Sound output changed");
    const t = setTimeout(() => setSoundNote(null), 3000);
    return () => clearTimeout(t);
  }, [call.outputDeviceId]);

  const [showDetails, setShowDetails] = useState(false);
  useEffect(() => {
    if (!open) setShowDetails(false);
  }, [open]);
  const numbers = (v: { width: number; height: number; fps: number } | null) =>
    v ? `${v.width}×${v.height} at ${v.fps} fps` : "no video";
  const route = call.relayed === null ? "" : call.relayed ? " · via relay" : " · direct";
  const details = `Sending ${numbers(call.sentVideo)} · receiving ${numbers(call.receivedVideo)}${route}`;

  const screenRef = useRef<HTMLDivElement | null>(null);
  const [fullscreenOn, setFullscreenOn] = useState(false);
  const [fullscreenOffered, setFullscreenOffered] = useState(false);
  useEffect(() => {
    setFullscreenOffered(!!document.fullscreenEnabled);
    const onChange = () => setFullscreenOn(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
    else void screenRef.current?.requestFullscreen?.().catch(() => undefined);
  }, []);

  const cardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!fullOpen) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cardRef.current?.focus({ preventScroll: true });
    return () => {
      if (before && document.contains(before) && !wouldOpenKeyboard(before)) {
        before.focus({ preventScroll: true });
      }
    };
  }, [fullOpen]);

  if (!open || !peer) return null;

  const canMinimize = !incoming && !over;
  const minimize = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
    setMinimized(true);
  };
  const backToChat = () => {
    minimize();
    if (call.chatId) onOpenChat?.(call.chatId);
  };
  const status = statusText(state, {
    message: call.errorMessage,
    videoCall: call.remoteVideoOn,
    weak: call.quality === "poor",
    reached: call.reached,
  });

  if (asPill) {
    const line = over ? status : state === "connected" ? duration : status;
    return (
      <div
        className={cn(styles.pill, locked && styles.pillHigh)}
        role="region"
        aria-label="Call in progress"
      >
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="flex min-w-0 items-center gap-2.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <UserAvatar
            userId={peer.id}
            username={peer.name}
            displayName={peer.name}
            avatarUrl={peer.avatarUrl}
            size="md"
          />
          <span className="min-w-0">
            <span className="block max-w-[9.5rem] truncate text-sm font-bold leading-tight">
              <span className="sr-only">Back to the call with </span>
              {peer.name}
            </span>
            <span
              className="block max-w-[9.5rem] truncate text-xs font-medium tabular-nums text-muted-foreground"
              aria-live={state === "connected" ? "off" : "polite"}
            >
              {line}
            </span>
          </span>
        </button>
        {over ? (
          <PillButton label="Close" onClick={dismiss}>
            <X />
          </PillButton>
        ) : (
          <>
            <PillButton
              label={call.muted ? "Unmute" : "Mute"}
              onClick={toggleMute}
              active={call.muted}
            >
              {call.muted ? <MicOff /> : <Mic />}
            </PillButton>
            <PillButton label="End call" onClick={hangUp} danger>
              <PhoneOff />
            </PillButton>
          </>
        )}
      </div>
    );
  }

  const theirVideo = live && call.remoteVideoOn ? call.remoteStream : null;
  const myVideo = call.videoEnabled && !over ? call.localStream : null;
  const previewSelf = !!myVideo && !theirVideo && (state === "calling" || state === "connecting");
  const pictureOnStage = !!theirVideo || previewSelf;

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      if (canMinimize) minimize();
      else if (over) dismiss();
      return;
    }
    if (e.key !== "Tab") return;
    const stops = e.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled])");
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (!first || !last) {
      e.preventDefault();
      return;
    }
    const at = document.activeElement;
    if (e.shiftKey && (at === first || at === e.currentTarget)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && at === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div ref={screenRef} className={styles.screen}>
      <div
        ref={cardRef}
        className={cn(styles.card, pictureOnStage && styles.cardVideo)}
        role="dialog"
        aria-modal="true"
        aria-label={
          incoming
            ? `Incoming ${call.remoteVideoOn ? "video" : "voice"} call from ${peer.name}`
            : `Call with ${peer.name}`
        }
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <CallStage
          peer={peer}
          alive={incoming || state === "calling"}
          remoteVideo={theirVideo}
          localVideo={myVideo}
          previewSelf={previewSelf}
          remoteMuted={live && !call.remoteAudioOn}
          onMinimize={canMinimize ? backToChat : null}
          fullscreen={
            fullscreenOffered && pictureOnStage && !over
              ? { on: fullscreenOn, toggle: toggleFullscreen }
              : null
          }
        />

        <div className={styles.sheet}>
          <h2 className="max-w-full truncate text-[1.625rem] font-extrabold leading-tight tracking-[-0.01em]">
            {peer.name}
          </h2>

          <p
            className={cn(
              "mt-1 flex min-h-6 max-w-[21rem] items-center justify-center gap-1.5 text-[0.9375rem] font-medium leading-snug",
              state === "failed" ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {incoming &&
              (call.remoteVideoOn ? (
                <Video className="h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
              ))}
            {(state === "connecting" || state === "reconnecting") && (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            )}
            {state === "connected" && (
              <button
                type="button"
                onClick={() => setShowDetails((on) => !on)}
                aria-expanded={showDetails}
                className="rounded-full px-1.5 tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="sr-only">Call details, </span>
                <span role="timer">{duration}</span>
              </button>
            )}
            {state === "connected" && status && (
              <>
                <span aria-hidden="true">·</span>
                <SignalLow className="h-4 w-4 shrink-0" aria-hidden="true" />
              </>
            )}
            <span aria-live="polite" className={cn(state === "failed" && "text-balance")}>
              {status}
            </span>
            {state === "ended" && call.connectedAt !== null && !call.errorMessage && (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{duration}</span>
              </>
            )}
          </p>

          <p
            role="status"
            className={cn(
              "mt-1 min-h-5 max-w-[21rem] text-[0.8125rem] font-medium leading-snug text-balance",
              call.cameraError ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {over ? "" : (call.cameraError ?? soundNote ?? (showDetails ? details : ""))}
          </p>

          {incoming ? (
            <>
              <div className="mt-4 flex w-full max-w-[17rem] items-start justify-between">
                <CallControl large tone="danger" label="Decline" onClick={reject}>
                  <PhoneOff />
                </CallControl>
                <CallControl
                  large
                  tone="accept"
                  label="Accept"
                  onClick={() => accept(call.remoteVideoOn)}
                >
                  {call.remoteVideoOn ? <Video /> : <Phone />}
                </CallControl>
              </div>
              {call.remoteVideoOn && (
                <button
                  type="button"
                  onClick={() => accept(false)}
                  className="mt-4 inline-flex h-11 items-center justify-center rounded-full bg-muted px-5 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                >
                  Answer without camera
                </button>
              )}
            </>
          ) : over ? (
            <button
              type="button"
              onClick={dismiss}
              className="mt-4 inline-flex h-12 items-center justify-center rounded-full bg-muted px-8 text-[0.9375rem] font-semibold text-foreground transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              Close
            </button>
          ) : (
            <div className="mt-4 flex w-full max-w-[22rem] items-start justify-center gap-2 min-[375px]:gap-3">
              <CallControl
                label="Mute"
                onClick={toggleMute}
                active={call.muted}
                hearing={live && call.speaking && !call.muted}
              >
                {call.muted ? <MicOff /> : <Mic />}
              </CallControl>
              <CallControl
                label="Camera"
                onClick={toggleCamera}
                active={call.videoEnabled}
                disabled={!call.mediaReady}
              >
                {call.videoEnabled ? <Video /> : <VideoOff />}
              </CallControl>
              {canFlip && (
                <CallControl label="Flip" onClick={switchCamera}>
                  <SwitchCamera />
                </CallControl>
              )}
              {canPickOutput && (
                <CallControl label="Speaker" onClick={selectOutputDevice}>
                  <Volume2 />
                </CallControl>
              )}
              <CallControl
                tone="danger"
                label={state === "calling" ? "Cancel" : "End"}
                onClick={hangUp}
              >
                <PhoneOff />
              </CallControl>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PillButton({
  label,
  onClick,
  active,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "grid h-10 w-10 shrink-0 place-items-center rounded-full transition-[background-color,transform] duration-150 ease-out active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card [&_svg]:h-5 [&_svg]:w-5",
        danger
          ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
          : active
            ? "bg-foreground text-background hover:bg-foreground/90"
            : "bg-muted text-foreground hover:bg-foreground/10",
      )}
    >
      {children}
    </button>
  );
}
