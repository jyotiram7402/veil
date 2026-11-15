/**
 * Decides how large a picture to send.
 *
 * The app asks the browser to hold the resolution (see keepResolution in
 * codec.ts): that is what makes the picture sharp. The price is that a slow
 * link or a weak phone then pays in frames per second. This governor is the
 * safety valve: when the frame rate has collapsed for a while it sends a
 * smaller picture, one step at a time, and it goes back up once the link has
 * been fine for a good stretch. So the picture is as sharp as it can be while
 * still moving.
 *
 * Pure logic, fed once per stats sample (every 3 s); no browser APIs in here.
 */

/** scaleResolutionDownBy for each step: full size, 2/3, 1/2, 1/3 (720p → 480p → 360p → 240p). */
export const SCALE_STEPS = [1, 1.5, 2, 3] as const;

/** Samples in a row with a collapsed frame rate before stepping down (2 × 3 s). */
const BAD_SAMPLES = 2;
/** Samples in a row without any limit before trying a step up (8 × 3 s). */
const GOOD_SAMPLES = 8;
/** A step up that did not last this many samples makes the next try wait twice as long. */
const SETTLE_SAMPLES = 4;
const MAX_GOOD_SAMPLES = 40;

export type VideoHealth = {
  /** Frames per second actually sent. */
  fps: number;
  /** Frames per second the camera delivers, when known. */
  cameraFps: number | null;
  /** The encoder says it is holding back (bandwidth or processor). */
  limited: boolean;
};

export function createVideoGovernor() {
  let step = 0;
  let bad = 0;
  let good = 0;
  let goodNeeded = GOOD_SAMPLES;
  let sinceStepUp = Number.POSITIVE_INFINITY;

  return {
    /** The scale to send at right now. */
    scale(): number {
      return SCALE_STEPS[step]!;
    },

    /**
     * Feed one sample (null while the camera is off). Returns the new scale
     * when it should change, otherwise null.
     */
    next(health: VideoHealth | null): number | null {
      if (!health) {
        bad = 0;
        good = 0;
        return null;
      }
      sinceStepUp++;
      // "Collapsed": under half of what the camera delivers, and at most 12.
      const floor = Math.min(12, (health.cameraFps ?? 24) / 2);
      if (health.limited && health.fps < floor) {
        bad++;
        good = 0;
      } else if (!health.limited) {
        good++;
        bad = 0;
      } else {
        // Held back a little, but still moving: leave it alone.
        bad = 0;
        good = 0;
      }

      if (bad >= BAD_SAMPLES && step < SCALE_STEPS.length - 1) {
        // The last step up did not hold: be slower to try it again.
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

    /** A new call starts at full size again. */
    reset(): void {
      step = 0;
      bad = 0;
      good = 0;
      goodNeeded = GOOD_SAMPLES;
      sinceStepUp = Number.POSITIVE_INFINITY;
    },
  };
}

export type VideoGovernor = ReturnType<typeof createVideoGovernor>;
