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

export function videoConstraints(camera?: CameraChoice): MediaStreamConstraints {
  const video: MediaTrackConstraints = {
    width: { ideal: 1280, max: 1280 },
    height: { ideal: 720, max: 720 },
    frameRate: { ideal: 30, max: 30 },
    ...whichCamera(camera),
  };
  return { audio: false, video };
}

export function relaxedVideoConstraints(camera?: CameraChoice): MediaStreamConstraints {
  const video = whichCamera(camera);
  return { audio: false, video: Object.keys(video).length ? video : true };
}

export type CameraChoice = {
  deviceId?: string;
  facing?: "user" | "environment";
  exactFacing?: boolean;
};

function whichCamera(camera?: CameraChoice): MediaTrackConstraints {
  if (camera?.deviceId) return { deviceId: { exact: camera.deviceId } };
  if (camera?.facing) {
    return { facingMode: camera.exactFacing ? { exact: camera.facing } : camera.facing };
  }
  return {};
}

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
    if (!encoding) return;
    params.degradationPreference = "maintain-resolution";
    encoding.scaleResolutionDownBy = scaleDown;
    await sender.setParameters(params);
  } catch {}
}

export function preferOpus(transceiver: RTCRtpTransceiver | null | undefined): void {
  try {
    if (!transceiver || typeof transceiver.setCodecPreferences !== "function") return;
    const caps = RTCRtpReceiver.getCapabilities?.("audio");
    if (!caps?.codecs?.length) return;
    const opus = caps.codecs.filter((c) => /opus/i.test(c.mimeType));
    const others = caps.codecs.filter((c) => !/opus/i.test(c.mimeType));
    if (opus.length === 0) return;
    transceiver.setCodecPreferences([...opus, ...others]);
  } catch {}
}
