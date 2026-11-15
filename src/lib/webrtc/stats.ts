/**
 * Lightweight, local-only WebRTC quality sampling via getStats().
 *
 * Nothing is sent to the backend. We derive a coarse quality tier from several
 * signals (RTT, packet loss, jitter) so no single metric dominates. All field
 * access is defensive because stats shapes differ across browsers.
 */

export type Quality = "excellent" | "fair" | "poor" | "unknown";

/** One picture stream as it really travels: its size and frames per second. */
export type VideoNumbers = { width: number; height: number; fps: number };

export type VideoSample = {
  /** What we send. `limited`: the encoder is holding back (slow link or busy processor). */
  sent: (VideoNumbers & { limited: boolean }) | null;
  /** Frames per second our camera delivers. */
  cameraFps: number | null;
  /** What arrives from the other side. */
  received: VideoNumbers | null;
};

export type QualitySample = {
  quality: Quality;
  rttMs: number | null;
  lossPct: number | null;
  jitterMs: number | null;
  video: VideoSample;
};

type LossTracker = { lastReceived: number; lastLost: number };

const NO_VIDEO: VideoSample = { sent: null, cameraFps: null, received: null };

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** The size and frame rate of one outbound-rtp / inbound-rtp video report, if it has a picture. */
function videoNumbers(report: Record<string, unknown>): VideoNumbers | null {
  const width = num(report.frameWidth);
  const height = num(report.frameHeight);
  if (!width || !height) return null;
  return { width, height, fps: Math.round(num(report.framesPerSecond) ?? 0) };
}

/** Stateful sampler: call sample() on an interval; it computes deltas itself. */
export function createQualitySampler() {
  const loss: LossTracker = { lastReceived: 0, lastLost: 0 };

  return async function sample(pc: RTCPeerConnection): Promise<QualitySample> {
    let rttMs: number | null = null;
    let jitterMs: number | null = null;
    let lossPct: number | null = null;
    const video: VideoSample = { sent: null, cameraFps: null, received: null };

    try {
      const stats = await pc.getStats();
      let received = 0;
      let lost = 0;

      stats.forEach((raw) => {
        // Browser stats shapes vary and aren't fully typed in lib.dom.
        const report = raw as Record<string, unknown> & { type: string };
        if (report.type === "candidate-pair" && report.state === "succeeded") {
          if (typeof report.currentRoundTripTime === "number") {
            rttMs = Math.round(report.currentRoundTripTime * 1000);
          }
        }
        if (report.type === "inbound-rtp" && report.kind === "audio") {
          if (typeof report.jitter === "number") jitterMs = Math.round(report.jitter * 1000);
          if (typeof report.packetsReceived === "number") received = report.packetsReceived;
          if (typeof report.packetsLost === "number") lost = report.packetsLost;
        }
        if (report.type === "outbound-rtp" && report.kind === "video") {
          const numbers = videoNumbers(report);
          const reason = report.qualityLimitationReason;
          if (numbers) {
            video.sent = { ...numbers, limited: typeof reason === "string" && reason !== "none" };
          }
        }
        if (report.type === "media-source" && report.kind === "video") {
          video.cameraFps = num(report.framesPerSecond);
        }
        if (report.type === "inbound-rtp" && report.kind === "video") {
          video.received = videoNumbers(report);
        }
      });

      const dReceived = received - loss.lastReceived;
      const dLost = lost - loss.lastLost;
      loss.lastReceived = received;
      loss.lastLost = lost;
      if (dReceived + dLost > 0) {
        lossPct = Math.max(0, Math.min(100, (dLost / (dReceived + dLost)) * 100));
      }
    } catch {
      return { quality: "unknown", rttMs: null, lossPct: null, jitterMs: null, video: NO_VIDEO };
    }

    return { quality: computeQuality(rttMs, lossPct, jitterMs), rttMs, lossPct, jitterMs, video };
  };
}

function computeQuality(
  rttMs: number | null,
  lossPct: number | null,
  jitterMs: number | null,
): Quality {
  if (rttMs === null && lossPct === null && jitterMs === null) return "unknown";
  const poor = (lossPct ?? 0) > 8 || (rttMs ?? 0) > 500 || (jitterMs ?? 0) > 60;
  if (poor) return "poor";
  const fair = (lossPct ?? 0) > 3 || (rttMs ?? 0) > 250 || (jitterMs ?? 0) > 30;
  if (fair) return "fair";
  return "excellent";
}

export const STATS_INTERVAL_MS = 3000;
