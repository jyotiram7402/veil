export const SCALE_STEPS = [1, 1.5, 2, 3] as const;

const BAD_SAMPLES = 2;
const GOOD_SAMPLES = 8;
const SETTLE_SAMPLES = 4;
const MAX_GOOD_SAMPLES = 40;

export type VideoHealth = {
  fps: number;
  cameraFps: number | null;
  limited: boolean;
};

export function createVideoGovernor() {
  let step = 0;
  let bad = 0;
  let good = 0;
  let goodNeeded = GOOD_SAMPLES;
  let sinceStepUp = Number.POSITIVE_INFINITY;

  return {
    scale(): number {
      return SCALE_STEPS[step]!;
    },

    next(health: VideoHealth | null): number | null {
      if (!health) {
        bad = 0;
        good = 0;
        return null;
      }
      sinceStepUp++;
      const floor = Math.min(12, (health.cameraFps ?? 24) / 2);
      if (health.limited && health.fps < floor) {
        bad++;
        good = 0;
      } else if (!health.limited) {
        good++;
        bad = 0;
      } else {
        bad = 0;
        good = 0;
      }

      if (bad >= BAD_SAMPLES && step < SCALE_STEPS.length - 1) {
        if (sinceStepUp <= SETTLE_SAMPLES) goodNeeded = Math.min(goodNeeded * 2, MAX_GOOD_SAMPLES);
        step++;
        bad = 0;
        good = 0;
        return SCALE_STEPS[step]!;
      }
      if (good >= goodNeeded && step > 0) {
        step--;
        bad = 0;
        good = 0;
        sinceStepUp = 0;
        return SCALE_STEPS[step]!;
      }
      return null;
    },

    reset(): void {
      step = 0;
      bad = 0;
      good = 0;
      goodNeeded = GOOD_SAMPLES;
      sinceStepUp = Number.POSITIVE_INFINITY;
    },
  };
}
