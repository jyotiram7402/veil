/**
 * Minimal in-app ringtone using the Web Audio API — no audio file, no
 * recording, no microphone. Best-effort: browser autoplay policies may block
 * sound until a user gesture, in which case this stays silent (no repeated
 * attempts, no errors surfaced). Always stops on accept/decline/end.
 */

type Ringtone = { stop: () => void };

export function playRingtone(): Ringtone {
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
    interval = setInterval(beep, 2500); // classic ring cadence
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
