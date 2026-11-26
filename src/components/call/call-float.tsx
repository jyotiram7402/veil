"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { StreamVideo, isSelfie, stageLook } from "@/components/call/call-stage";
import { cn } from "@/lib/utils";
import type { PeerInfo } from "@/lib/webrtc/types";
import styles from "./call.module.css";

export type FloatCorner = "top-right" | "top-left" | "bottom-right" | "bottom-left";

const DRAG_START_PX = 6;
const CLICK_AFTER_DRAG_MS = 350;

const CORNER_CLASS: Record<FloatCorner, string> = {
  "top-right": cn(styles.floatTop, styles.floatRight),
  "top-left": cn(styles.floatTop, styles.floatLeft),
  "bottom-right": cn(styles.floatBottom, styles.floatRight),
  "bottom-left": cn(styles.floatBottom, styles.floatLeft),
};

function nearestCorner(rect: { left: number; top: number; width: number; height: number }): FloatCorner {
  const top = rect.top + rect.height / 2 < window.innerHeight / 2;
  const left = rect.left + rect.width / 2 < window.innerWidth / 2;
  if (top) return left ? "top-left" : "top-right";
  return left ? "bottom-left" : "bottom-right";
}

function Tile({
  person,
  stream,
  mirrored,
  micOff,
  label,
}: {
  person: PeerInfo;
  stream: MediaStream | null;
  mirrored?: boolean;
  micOff: boolean;
  label: string;
}) {
  const look = stageLook(person);
  const [brokenPhoto, setBrokenPhoto] = useState<string | null>(null);
  const showPhoto = !!look.photoUrl && look.photoUrl !== brokenPhoto;
  return (
    <span className={styles.floatTile} style={{ "--stage": look.ground } as React.CSSProperties}>
      <span className={styles.floatFace} aria-hidden="true">
        {showPhoto ? (
          <img
            className={styles.floatPhoto}
            src={look.photoUrl ?? undefined}
            alt=""
            onError={() => setBrokenPhoto(look.photoUrl)}
          />
        ) : (
          look.emoji
        )}
      </span>
      {stream && <StreamVideo stream={stream} label={label} mirrored={mirrored} />}
      {micOff && (
        <span className={styles.floatMuted}>
          <MicOff aria-hidden="true" />
        </span>
      )}
    </span>
  );
}

export function CallFloat({
  peer,
  me,
  theirVideo,
  myVideo,
  theirMicOff,
  muted,
  line,
  corner,
  onCorner,
  onExpand,
  onToggleMute,
  onHangUp,
}: {
  peer: PeerInfo;
  me: PeerInfo;
  theirVideo: MediaStream | null;
  myVideo: MediaStream | null;
  theirMicOff: boolean;
  muted: boolean;
  line: string;
  corner: FloatCorner;
  onCorner: (corner: FloatCorner) => void;
  onExpand: () => void;
  onToggleMute: () => void;
  onHangUp: () => void;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    moved: boolean;
    start: { left: number; top: number; width: number; height: number };
  } | null>(null);
  const draggedAt = useRef(0);
  const flipFrom = useRef<{ left: number; top: number } | null>(null);
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = boxRef.current;
    const from = flipFrom.current;
    flipFrom.current = null;
    if (!el || !from) return;
    const to = el.getBoundingClientRect();
    el.style.transition = "none";
    el.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px)`;
    el.getBoundingClientRect();
    el.style.transition = "";
    el.style.transform = "";
  }, [corner]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      start: { left, top, width, height },
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const x = e.clientX - d.x;
    const y = e.clientY - d.y;
    if (!d.moved) {
      if (Math.hypot(x, y) < DRAG_START_PX) return;
      d.moved = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
    }
    setOffset({ x, y });
  }

  function onPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    draggedAt.current = e.timeStamp;
    const dropped = {
      left: d.start.left + e.clientX - d.x,
      top: d.start.top + e.clientY - d.y,
      width: d.start.width,
      height: d.start.height,
    };
    const next = nearestCorner(dropped);
    if (next !== corner) {
      flipFrom.current = { left: dropped.left, top: dropped.top };
      onCorner(next);
    }
    setOffset(null);
  }

  function stopClickAfterDrag(e: React.MouseEvent) {
    if (!draggedAt.current || e.timeStamp - draggedAt.current > CLICK_AFTER_DRAG_MS) return;
    draggedAt.current = 0;
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <div
      ref={boxRef}
      role="region"
      aria-label={`Video call with ${peer.name}`}
      className={cn(styles.float, CORNER_CLASS[corner], offset && styles.floatDragging)}
      style={offset ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onClickCapture={stopClickAfterDrag}
    >
      <button
        type="button"
        onClick={onExpand}
        aria-label={`Back to the call with ${peer.name}`}
        className={styles.floatTiles}
      >
        <Tile person={peer} stream={theirVideo} micOff={theirMicOff} label={`${peer.name}, camera`} />
        <Tile
          person={me}
          stream={myVideo}
          mirrored={!!myVideo && isSelfie(myVideo)}
          micOff={muted}
          label="Your camera"
        />
      </button>
      <div className={styles.floatBar}>
        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? "Unmute" : "Mute"}
          aria-pressed={muted}
          className={cn(styles.floatButton, muted && styles.floatButtonOn)}
        >
          {muted ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
        </button>
        <span className={styles.floatLine}>{line}</span>
        <button
          type="button"
          onClick={onHangUp}
          aria-label="End call"
          className={cn(styles.floatButton, styles.floatButtonEnd)}
        >
          <PhoneOff aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
