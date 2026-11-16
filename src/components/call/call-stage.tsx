"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize, MessageCircle, MicOff, Minimize } from "lucide-react";
import { mojiFor, parseMojiValue } from "@/lib/moji";
import { cn } from "@/lib/utils";
import type { PeerInfo } from "@/lib/webrtc/types";
import styles from "./call.module.css";

const CHIP =
  "inline-flex h-10 items-center gap-1.5 rounded-full bg-card pl-3 pr-3.5 text-sm font-semibold text-card-foreground shadow-[0_10px_22px_-14px_rgb(15_18_30/0.6)]";

function stageLook(peer: PeerInfo) {
  const chosen = parseMojiValue(peer.avatarUrl);
  const moji = chosen ?? mojiFor(peer.id || peer.name);
  return {
    emoji: moji.emoji,
    ground: moji.bg,
    photoUrl: chosen ? null : peer.avatarUrl,
    tone: isPale(moji.bg) ? "light" : "dark",
  };
}

function isPale(hex: string): boolean {
  const n = Number.parseInt(hex.slice(1), 16);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return luminance > 0.45;
}

const MAX_CUT = 0.25;

function isSelfie(stream: MediaStream): boolean {
  return stream.getVideoTracks()[0]?.getSettings().facingMode !== "environment";
}

export function CallStage({
  peer,
  alive,
  remoteVideo,
  localVideo,
  previewSelf,
  remoteMuted,
  onMinimize,
  fullscreen,
}: {
  peer: PeerInfo;
  alive: boolean;
  remoteVideo: MediaStream | null;
  localVideo: MediaStream | null;
  previewSelf: boolean;
  remoteMuted: boolean;
  onMinimize: (() => void) | null;
  fullscreen: { on: boolean; toggle: () => void } | null;
}) {
  const look = stageLook(peer);
  const [brokenPhoto, setBrokenPhoto] = useState<string | null>(null);
  const [selfWide, setSelfWide] = useState(false);
  const showPhoto = !!look.photoUrl && look.photoUrl !== brokenPhoto;
  const showPip = !!localVideo && !(previewSelf && !remoteVideo);

  return (
    <div
      className={styles.stage}
      data-tone={look.tone}
      style={{ "--stage": look.ground } as React.CSSProperties}
    >
      <div className={styles.rings} aria-hidden="true" />

      <div className={cn(styles.hero, alive && styles.alive)} aria-hidden="true">
        <div className={styles.heroBody}>
          <span className={styles.ripple} />
          <span className={styles.ripple} />
          <span className={styles.ripple} />
          {showPhoto ? (
            <img
              className={styles.photo}
              src={look.photoUrl ?? undefined}
              alt=""
              onError={() => setBrokenPhoto(look.photoUrl)}
            />
          ) : (
            <span className={styles.emoji}>{look.emoji}</span>
          )}
        </div>
      </div>

      {remoteVideo ? (
        <StreamVideo key="theirs" stream={remoteVideo} label={`${peer.name}, camera`} wholeIfCut />
      ) : (
        previewSelf &&
        localVideo && (
          <StreamVideo key="mine" stream={localVideo} label="Your camera" mirrored={isSelfie(localVideo)} />
        )
      )}

      {showPip && localVideo && (
        <div className={cn(styles.pip, selfWide && styles.pipWide)}>
          <StreamVideo
            key="mine-small"
            stream={localVideo}
            label="Your camera"
            mirrored={isSelfie(localVideo)}
            onShape={setSelfWide}
          />
        </div>
      )}

      {onMinimize && (
        <div className={styles.stageTop}>
          <button
            type="button"
            onClick={onMinimize}
            className={cn(
              CHIP,
              "transition-transform duration-150 ease-out active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            )}
          >
            <MessageCircle className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
            Chat
            <span className="sr-only">: the call keeps running</span>
          </button>
        </div>
      )}

      {(remoteMuted || (previewSelf && !remoteVideo && !!localVideo)) && (
        <div className={styles.stageNote}>
          {remoteMuted ? (
            <span className={CHIP} role="status">
              <MicOff className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
              Muted
            </span>
          ) : (
            <span className={CHIP}>Your camera</span>
          )}
        </div>
      )}

      {fullscreen && (
        <div className={styles.stageCorner}>
          <button
            type="button"
            onClick={fullscreen.toggle}
            aria-label={fullscreen.on ? "Leave full screen" : "Full screen"}
            className="grid h-10 w-10 place-items-center rounded-full bg-card text-card-foreground shadow-[0_10px_22px_-14px_rgb(15_18_30/0.6)] transition-transform duration-150 ease-out active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {fullscreen.on ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </button>
        </div>
      )}
    </div>
  );
}

function StreamVideo({
  stream,
  label,
  mirrored,
  wholeIfCut,
  onShape,
}: {
  stream: MediaStream;
  label: string;
  mirrored?: boolean;
  wholeIfCut?: boolean;
  onShape?: (wide: boolean) => void;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);
  const [whole, setWhole] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    void el.play().catch(() => undefined);

    const check = () => {
      const { videoWidth, videoHeight, clientWidth, clientHeight } = el;
      if (videoWidth === 0 || videoHeight === 0) return;
      setReady(true);
      onShape?.(videoWidth >= videoHeight);
      if (wholeIfCut && clientWidth > 0 && clientHeight > 0) {
        const picture = videoWidth / videoHeight;
        const box = clientWidth / clientHeight;
        setWhole(1 - Math.min(picture / box, box / picture) > MAX_CUT);
      }
    };
    check();
    el.addEventListener("loadeddata", check);
    el.addEventListener("resize", check);
    const boxWatch = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check);
    boxWatch?.observe(el);
    return () => {
      el.removeEventListener("loadeddata", check);
      el.removeEventListener("resize", check);
      boxWatch?.disconnect();
    };
  }, [stream, onShape, wholeIfCut]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      aria-label={label}
      className={cn(
        styles.video,
        ready && styles.videoOn,
        mirrored && styles.mirror,
        whole && styles.videoFit,
      )}
    />
  );
}
