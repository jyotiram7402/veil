"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  Maximize,
  MessageSquare,
  Mic,
  MicOff,
  Minimize,
  Phone,
  PhoneOff,
  SwitchCamera,
  Volume2,
} from "lucide-react";
import { UserAvatar } from "@/components/chat/user-avatar";
import { useCallStore } from "@/store/call-store";
import { playRingtone } from "@/lib/webrtc/ringtone";
import { cn } from "@/lib/utils";
import type { CallState } from "@/lib/webrtc/types";
import type { Quality } from "@/lib/webrtc/stats";
import type { Profile } from "@/types/chat";

function statusText(state: CallState, error: string | null): string {
  switch (state) {
    case "calling":
      return "Calling…";
    case "ringing":
      return "Incoming call";
    case "connecting":
      return "Connecting…";
    case "reconnecting":
      return "Reconnecting…";
    case "disconnected":
      return "Connection lost";
    case "rejected":
      return "Call declined";
    case "busy":
      return "On another call";
    case "failed":
      return error ?? "Call failed";
    case "ended":
      return "Call ended";
    default:
      return "";
  }
}

function useDuration(active: boolean, since: number | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active || !since) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active, since]);
  if (!since) return "0:00";
  const total = Math.max(0, Math.floor((now - since) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const QUALITY_META: Record<Quality, { color: string; label: string } | null> = {
  excellent: { color: "bg-emerald-500", label: "Good connection" },
  fair: { color: "bg-amber-500", label: "Network unstable" },
  poor: { color: "bg-red-500", label: "Poor connection" },
  unknown: null,
};

export function CallOverlay({
  me,
  accept,
  reject,
  hangUp,
  toggleMute,
  toggleCamera,
  switchCamera,
  selectOutputDevice,
}: {
  me: Profile;
  accept: () => void;
  reject: () => void;
  hangUp: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  switchCamera: () => void;
  selectOutputDevice: () => void;
}) {
  const {
    state,
    peer,
    muted,
    connectedAt,
    errorMessage,
    quality,
    speaking,
    videoEnabled,
    remoteVideoOn,
    cameraError,
    localStream,
    remoteStream,
    minimized,
  } = useCallStore();
  const setMinimized = useCallStore((s) => s.setMinimized);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const timerActive = state === "connected" || state === "reconnecting";
  const duration = useDuration(timerActive, connectedAt);

  const inLiveCall = state === "connected" || state === "reconnecting";
  const videoMode = (videoEnabled || remoteVideoOn) && state !== "ringing";

  // Bind media streams to the <video> elements.
  useEffect(() => {
    if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, videoMode]);
  useEffect(() => {
    if (localVideoRef.current && localVideoRef.current.srcObject !== localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, videoMode]);

  // Auto-hide controls during a video call; always show otherwise.
  const nudgeControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (videoMode && inLiveCall) {
      hideTimer.current = setTimeout(() => setControlsVisible(false), 3500);
    }
  }, [videoMode, inLiveCall]);
  useEffect(() => {
    nudgeControls();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [nudgeControls]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Incoming-call ringtone (best-effort; stops on any state change).
  useEffect(() => {
    if (state !== "ringing") return;
    const r = playRingtone();
    return () => r.stop();
  }, [state]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => undefined);
    } else {
      void el.requestFullscreen?.().catch(() => undefined);
    }
  }, []);

  if (state === "idle" || !peer) return null;

  const incoming = state === "ringing";
  const canControl = inLiveCall || state === "connecting" || state === "calling";
  const q = QUALITY_META[quality];
  const reconnecting = state === "reconnecting";
  const controlsShown = controlsVisible || !videoMode;

  // Minimized: collapse to a floating bar so the chat underneath is usable.
  // Incoming calls never minimize (the user must see accept/decline).
  if (minimized && !incoming) {
    return (
      <div
        className="fixed inset-x-0 top-0 z-[70] flex items-center gap-3 bg-header px-3 py-2 text-header-foreground shadow-md"
        style={{ paddingTop: "max(env(safe-area-inset-top), 0.5rem)" }}
        role="dialog"
        aria-label="Call in progress"
      >
        <span
          className={cn(
            "h-2.5 w-2.5 rounded-full",
            reconnecting ? "bg-amber-400 animate-pulse" : q ? q.color : "bg-emerald-400",
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{peer.name}</div>
          <div className="text-[11px] tabular-nums opacity-80">
            {reconnecting ? "Reconnecting…" : state === "connected" ? duration : statusText(state, errorMessage)}
          </div>
        </div>
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? "Unmute microphone" : "Mute microphone"}
          className="grid h-9 w-9 place-items-center rounded-full bg-white/15 hover:bg-white/25"
        >
          {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => setMinimized(false)}
          aria-label="Expand call"
          className="grid h-9 w-9 place-items-center rounded-full bg-white/15 hover:bg-white/25"
        >
          <Maximize className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={hangUp}
          aria-label="End call"
          className="grid h-9 w-9 place-items-center rounded-full bg-destructive text-white hover:bg-destructive/90"
        >
          <PhoneOff className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "fixed inset-0 z-[70] flex flex-col",
        videoMode ? "bg-black text-white" : "bg-background/95 backdrop-blur-sm",
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Call"
      onMouseMove={videoMode ? nudgeControls : undefined}
      onTouchStart={videoMode ? nudgeControls : undefined}
    >
      {videoMode ? (
        /* ---------- VIDEO LAYOUT ---------- */
        <>
          {/* Remote video (or remote identity if their camera is off) */}
          <div className="absolute inset-0">
            {remoteVideoOn ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-neutral-900">
                <UserAvatar
                  userId={peer.id}
                  username={peer.name}
                  displayName={peer.name}
                  avatarUrl={peer.avatarUrl}
                  size="xl"
                />
                <div className="text-lg font-medium">{peer.name}</div>
                <div className="text-xs text-white/60">Camera off</div>
              </div>
            )}
          </div>

          {/* Top status bar */}
          <div
            className={cn(
              "relative z-10 flex items-center justify-between px-4 transition-opacity",
              controlsShown ? "opacity-100" : "opacity-0",
            )}
            style={{ paddingTop: "max(env(safe-area-inset-top), 0.75rem)" }}
          >
            <div className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-1 text-xs">
              {reconnecting ? (
                <span className="inline-flex items-center gap-1.5 text-amber-300">
                  <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" /> Reconnecting…
                </span>
              ) : (
                <>
                  {q && <span className={cn("h-2 w-2 rounded-full", q.color)} aria-hidden />}
                  <span className="tabular-nums">{state === "connected" ? duration : statusText(state, errorMessage)}</span>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              className="grid h-9 w-9 place-items-center rounded-full bg-black/40 hover:bg-black/60"
            >
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
          </div>

          {/* Local preview (or local identity when camera off) */}
          <div className="absolute right-3 top-16 z-10 h-40 w-28 overflow-hidden rounded-xl border border-white/20 bg-neutral-800 shadow-lg sm:h-44 sm:w-32">
            {videoEnabled ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full -scale-x-100 object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1.5">
                <UserAvatar
                  userId={me.id}
                  username={me.username}
                  displayName={me.display_name}
                  avatarUrl={me.avatar_url}
                  size="md"
                />
                <span className="text-[10px] text-white/60">Camera off</span>
              </div>
            )}
          </div>

          <div className="flex-1" />

          {/* Controls */}
          <div
            className={cn(
              "relative z-10 flex items-center justify-center gap-4 pb-6 pt-4 transition-opacity",
              controlsShown ? "opacity-100" : "opacity-0 pointer-events-none",
            )}
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1.5rem)" }}
          >
            <Controls
              incoming={false}
              inLiveCall={inLiveCall}
              muted={muted}
              videoEnabled={videoEnabled}
              onMute={toggleMute}
              onCamera={toggleCamera}
              onSwitchCamera={switchCamera}
              onSpeaker={selectOutputDevice}
              onMinimize={() => setMinimized(true)}
              onEnd={hangUp}
              onAccept={accept}
              onReject={reject}
              dark
            />
          </div>
        </>
      ) : (
        /* ---------- VOICE LAYOUT ---------- */
        <div
          className="flex flex-1 flex-col items-center justify-between"
          style={{
            paddingTop: "max(env(safe-area-inset-top), 2rem)",
            paddingBottom: "max(env(safe-area-inset-bottom), 2rem)",
          }}
        >
          <p className="text-xs uppercase tracking-wide text-muted-foreground sm:hidden">
            Private call
          </p>
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <div className={cn("rounded-full transition-shadow", speaking && inLiveCall && "ring-4 ring-emerald-500/40")}>
              <UserAvatar
                userId={peer.id}
                username={peer.name}
                displayName={peer.name}
                avatarUrl={peer.avatarUrl}
                size="xl"
              />
            </div>
            <div className="text-center">
              <div className="text-xl font-medium">{peer.name}</div>
              <div className="mt-1.5 flex items-center justify-center gap-2 text-sm" aria-live="polite">
                {inLiveCall && q && !reconnecting && (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <span className={cn("h-2 w-2 rounded-full", q.color)} aria-hidden />
                    {q.label}
                  </span>
                )}
                {reconnecting && (
                  <span className="inline-flex items-center gap-1.5 text-amber-500">
                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" aria-hidden />
                    Reconnecting…
                  </span>
                )}
                {!inLiveCall && (
                  <span className={cn("text-muted-foreground", state === "failed" && "text-destructive")}>
                    {statusText(state, errorMessage)}
                  </span>
                )}
              </div>
              {(state === "connected" || reconnecting) && (
                <div className="mt-1 text-sm tabular-nums text-muted-foreground">{duration}</div>
              )}
              {cameraError && inLiveCall && (
                <div className="mt-2 text-xs text-amber-500">{cameraError}</div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-center gap-4 pb-2 sm:mt-12 sm:pb-0">
            <Controls
              incoming={incoming}
              inLiveCall={inLiveCall}
              canControl={canControl}
              muted={muted}
              videoEnabled={videoEnabled}
              onMute={toggleMute}
              onCamera={toggleCamera}
              onSwitchCamera={switchCamera}
              onSpeaker={selectOutputDevice}
              onMinimize={() => setMinimized(true)}
              onEnd={hangUp}
              onAccept={accept}
              onReject={reject}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Controls({
  incoming,
  inLiveCall,
  canControl = true,
  muted,
  videoEnabled,
  onMute,
  onCamera,
  onSwitchCamera,
  onSpeaker,
  onMinimize,
  onEnd,
  onAccept,
  onReject,
  dark,
}: {
  incoming: boolean;
  inLiveCall: boolean;
  canControl?: boolean;
  muted: boolean;
  videoEnabled: boolean;
  onMute: () => void;
  onCamera: () => void;
  onSwitchCamera: () => void;
  onSpeaker: () => void;
  onMinimize?: () => void;
  onEnd: () => void;
  onAccept: () => void;
  onReject: () => void;
  dark?: boolean;
}) {
  if (incoming) {
    return (
      <>
        <CircleButton label="Decline" onClick={onReject} variant="danger">
          <PhoneOff className="h-6 w-6" />
        </CircleButton>
        <CircleButton label="Accept" onClick={onAccept} variant="accept">
          <Phone className="h-6 w-6" />
        </CircleButton>
      </>
    );
  }
  if (!canControl) return null;
  return (
    <>
      <CircleButton
        label={muted ? "Unmute microphone" : "Mute microphone"}
        onClick={onMute}
        variant="neutral"
        pressed={muted}
        disabled={!inLiveCall}
        dark={dark}
      >
        {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
      </CircleButton>
      <CircleButton
        label={videoEnabled ? "Turn camera off" : "Turn camera on"}
        onClick={onCamera}
        variant="neutral"
        pressed={videoEnabled}
        disabled={!inLiveCall}
        dark={dark}
      >
        {videoEnabled ? <Camera className="h-6 w-6" /> : <CameraOff className="h-6 w-6" />}
      </CircleButton>
      {videoEnabled && (
        <CircleButton label="Switch camera" onClick={onSwitchCamera} variant="neutral" disabled={!inLiveCall} dark={dark}>
          <SwitchCamera className="h-6 w-6" />
        </CircleButton>
      )}
      <CircleButton label="Switch speaker" onClick={onSpeaker} variant="neutral" disabled={!inLiveCall} dark={dark}>
        <Volume2 className="h-6 w-6" />
      </CircleButton>
      {onMinimize && (
        <CircleButton label="Open chat" onClick={onMinimize} variant="neutral" dark={dark}>
          <MessageSquare className="h-6 w-6" />
        </CircleButton>
      )}
      <CircleButton label="End call" onClick={onEnd} variant="danger">
        <PhoneOff className="h-6 w-6" />
      </CircleButton>
    </>
  );
}

function CircleButton({
  children,
  label,
  onClick,
  variant,
  pressed,
  disabled,
  dark,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  variant: "danger" | "accept" | "neutral";
  pressed?: boolean;
  disabled?: boolean;
  dark?: boolean;
}) {
  const styles: Record<string, string> = {
    danger: "bg-destructive text-white hover:bg-destructive/90",
    accept: "bg-emerald-600 text-white hover:bg-emerald-600/90",
    neutral: pressed
      ? "bg-foreground text-background hover:bg-foreground/90"
      : dark
        ? "bg-white/15 text-white hover:bg-white/25"
        : "bg-muted text-foreground hover:bg-muted/80",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      className={cn(
        "grid h-14 w-14 place-items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 sm:h-16 sm:w-16",
        styles[variant],
      )}
    >
      {children}
    </button>
  );
}
