type Ringtone = { stop: () => void };

const RING_EVERY_MS = 2500;

function startBuzz(): () => void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return () => undefined;
  }
  const touched = () => {
    const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
      .userActivation;
    return activation ? activation.hasBeenActive : true;
  };
  const buzz = () => {
    if (!touched()) return;
    try {
      navigator.vibrate([350, 150, 350]);
    } catch {}
  };
  buzz();
  const interval = setInterval(buzz, RING_EVERY_MS);
  return () => {
    clearInterval(interval);
    try {
      navigator.vibrate(0);
    } catch {}
  };
}

export function playRingtone(): Ringtone {
  const stopBuzz = startBuzz();
  const ring = playTone();
  return {
    stop: () => {
      stopBuzz();
      ring.stop();
    },
  };
}

function playTone(): Ringtone {
  const Ctx =
    typeof window !== "undefined"
      ? (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : undefined;
  if (!Ctx) return { stop: () => undefined };

  let ctx: AudioContext | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  try {
    ctx = new Ctx();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.connect(ctx.destination);

    const beep = () => {
      if (!ctx || stopped) return;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 480;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.65);
    };

    void ctx.resume?.().catch(() => undefined);
    beep();
    interval = setInterval(beep, RING_EVERY_MS);
  } catch {
    return { stop: () => undefined };
  }

  return {
    stop: () => {
      stopped = true;
      if (interval) clearInterval(interval);
      interval = null;
      void ctx?.close().catch(() => undefined);
      ctx = null;
    },
  };
}
