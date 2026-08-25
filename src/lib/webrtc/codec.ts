/**
 * Audio capture constraints + Opus codec preference.
 *
 * Everything here is feature-detected and advisory: browsers silently ignore
 * unsupported constraints, and unsupported APIs are skipped. Nothing throws or
 * breaks Safari.
 */

/**
 * Mono, voice-optimized capture. We intentionally do NOT pin sampleRate /
 * sampleSize — those vary by device and forcing them causes failures on some
 * mobile browsers. channelCount:1 is a hint toward lower-bandwidth mono.
 */
export function audioConstraints(deviceId?: string): MediaStreamConstraints {
  const audio: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  };
  if (deviceId) audio.deviceId = { exact: deviceId };
  return { audio, video: false };
}

/**
 * Video capture constraints: 720p30 target, capped at 720p, with a device
 * facing hint on mobile. These are IDEAL/MAX hints — WebRTC adapts downward on
 * its own, and the hook retries with a relaxed constraint if the exact request
 * can't be satisfied, so a call never fails just because 720p is unavailable.
 */
export function videoConstraints(opts?: {
  deviceId?: string;
  facingMode?: "user" | "environment";
}): MediaStreamConstraints {
  const video: MediaTrackConstraints = {
    width: { ideal: 1280, max: 1280 },
    height: { ideal: 720, max: 720 },
    frameRate: { ideal: 30, max: 30 },
  };
  if (opts?.deviceId) video.deviceId = { exact: opts.deviceId };
  else if (opts?.facingMode) video.facingMode = opts.facingMode;
  return { audio: false, video };
}

/** Minimal fallback used when the 720p request is rejected. */
export function relaxedVideoConstraints(opts?: {
  deviceId?: string;
  facingMode?: "user" | "environment";
}): MediaStreamConstraints {
  const video: MediaTrackConstraints = {};
  if (opts?.deviceId) video.deviceId = { exact: opts.deviceId };
  else if (opts?.facingMode) video.facingMode = opts.facingMode;
  return { audio: false, video: Object.keys(video).length ? video : true };
}

/**
 * Prefer Opus on the audio transceiver when the browser exposes codec
 * preferences. No-op (and safe) on browsers without setCodecPreferences or
 * getCapabilities (e.g. older Safari), where Opus is already the default.
 */
export function preferOpus(transceiver: RTCRtpTransceiver | null | undefined): void {
  try {
    if (!transceiver || typeof transceiver.setCodecPreferences !== "function") return;
    const caps = RTCRtpReceiver.getCapabilities?.("audio");
    if (!caps?.codecs?.length) return;
    const opus = caps.codecs.filter((c) => /opus/i.test(c.mimeType));
    const others = caps.codecs.filter((c) => !/opus/i.test(c.mimeType));
    if (opus.length === 0) return;
    transceiver.setCodecPreferences([...opus, ...others]);
  } catch {
    /* codec preference is best-effort */
  }
}
