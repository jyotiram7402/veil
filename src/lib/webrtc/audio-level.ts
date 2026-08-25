/**
 * Local-only microphone activity detection (Web Audio API).
 *
 * Used purely to show a subtle "speaking" indicator. Audio never leaves the
 * device through this path — no recording, no upload. Feature-detected; a
 * no-op monitor is returned when Web Audio is unavailable.
 */

export type AudioLevelMonitor = { stop: () => void };

export function monitorAudioLevel(
  stream: MediaStream,
  onSpeaking: (speaking: boolean) => void,
): AudioLevelMonitor {
  const Ctx =
    typeof window !== "undefined"
      ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : undefined;
  if (!Ctx) return { stop: () => undefined };

  let ctx: AudioContext | null = null;
  let raf = 0;
  let speaking = false;
  let lastFlip = 0;

  try {
    ctx = new Ctx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteTimeDomainData(data);
      // RMS around the 128 midpoint.
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i]! - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      const now = Date.now();
      const next = rms > 0.045;
      // debounce state flips so the dot doesn't flicker
      if (next !== speaking && now - lastFlip > 180) {
        speaking = next;
        lastFlip = now;
        onSpeaking(speaking);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  } catch {
    return { stop: () => undefined };
  }

  return {
    stop: () => {
      if (raf) cancelAnimationFrame(raf);
      onSpeaking(false);
      void ctx?.close().catch(() => undefined);
      ctx = null;
    },
  };
}
