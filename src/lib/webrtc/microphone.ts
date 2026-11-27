import { audioConstraints } from "@/lib/webrtc/codec";

export const MIC_RETRY_MS = 400;

const RETRYABLE = new Set(["NotReadableError", "AbortError", "OverconstrainedError"]);

function retryable(err: unknown): boolean {
  return err instanceof DOMException && RETRYABLE.has(err.name);
}

export async function openMicrophone(
  media: Pick<MediaDevices, "getUserMedia">,
  deviceId?: string,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<MediaStream> {
  try {
    return await media.getUserMedia(audioConstraints(deviceId));
  } catch (err) {
    if (!retryable(err)) throw err;
  }
  await wait(MIC_RETRY_MS);
  return media.getUserMedia({ audio: true, video: false });
}
