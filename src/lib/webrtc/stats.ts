/**
 * Lightweight, local-only WebRTC quality sampling via getStats().
 *
 * Nothing is sent to the backend. We derive a coarse quality tier from several
 * signals (RTT, packet loss, jitter) so no single metric dominates. All field
 * access is defensive because stats shapes differ across browsers.
 */

export type Quality = "excellent" | "fair" | "poor" | "unknown";

export type QualitySample = {
  quality: Quality;
  rttMs: number | null;
  lossPct: number | null;
  jitterMs: number | null;
};

type LossTracker = { lastReceived: number; lastLost: number };

/** Stateful sampler: call sample() on an interval; it computes deltas itself. */
export function createQualitySampler() {
  const loss: LossTracker = { lastReceived: 0, lastLost: 0 };

  return async function sample(pc: RTCPeerConnection): Promise<QualitySample> {
    let rttMs: number | null = null;
    let jitterMs: number | null = null;
    let lossPct: number | null = null;

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
      });

      const dReceived = received - loss.lastReceived;
      const dLost = lost - loss.lastLost;
      loss.lastReceived = received;
      loss.lastLost = lost;
      if (dReceived + dLost > 0) {
        lossPct = Math.max(0, Math.min(100, (dLost / (dReceived + dLost)) * 100));
      }
    } catch {
      return { quality: "unknown", rttMs: null, lossPct: null, jitterMs: null };
    }

    return { quality: computeQuality(rttMs, lossPct, jitterMs), rttMs, lossPct, jitterMs };
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
