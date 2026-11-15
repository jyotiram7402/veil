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
export function videoConstraints(camera?: CameraChoice): MediaStreamConstraints {
  const video: MediaTrackConstraints = {
    width: { ideal: 1280, max: 1280 },
    height: { ideal: 720, max: 720 },
    frameRate: { ideal: 30, max: 30 },
    ...whichCamera(camera),
  };
  return { audio: false, video };
}

/** Minimal fallback used when the 720p request is rejected. */
export function relaxedVideoConstraints(camera?: CameraChoice): MediaStreamConstraints {
  const video = whichCamera(camera);
  return { audio: false, video: Object.keys(video).length ? video : true };
}

/**
 * Which camera to open: one exact device (a computer with several), or a side
 * (a phone: "user" is the front camera, "environment" the back).
 */
export type CameraChoice = {
  deviceId?: string;
  facing?: "user" | "environment";
  /** Only that side will do: fail instead of quietly opening another camera. */
  exactFacing?: boolean;
};

function whichCamera(camera?: CameraChoice): MediaTrackConstraints {
  if (camera?.deviceId) return { deviceId: { exact: camera.deviceId } };
  if (camera?.facing) {
    return { facingMode: camera.exactFacing ? { exact: camera.facing } : camera.facing };
  }
  return {};
}

/**
 * Tells the browser to hold the picture's resolution, sending it scaled down
 * by `scaleDown` (1 = full size).
 *
 * Left alone, Chromium answers a slow start or a weak link by shrinking the
 * picture: measured on a perfect connection, a call began at 180×320 and was
 * still at 360×640 a quarter of a minute later. Asked to hold the resolution,
 * it sends the full 720p from the first second and lowers the frame rate when
 * it has to; the video governor (video-governor.ts) then steps the size down
 * if that gets too slow. Best effort: a browser that does not know the setting
 * ignores it.
 */
export async function keepResolution(
  sender: RTCRtpSender | null | undefined,
  scaleDown = 1,
): Promise<void> {
  try {
    if (!sender || typeof sender.getParameters !== "function") return;
    const params = sender.getParameters() as RTCRtpSendParameters & {
      degradationPreference?: string;
    };
    const encoding = params.encodings?.[0];
    if (!encoding) return; // not negotiated that far yet: it is applied again later
    params.degradationPreference = "maintain-resolution";
    encoding.scaleResolutionDownBy = scaleDown;
    await sender.setParameters(params);
  } catch {
    /* best effort */
  }
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
