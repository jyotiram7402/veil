/**
 * Centralized ICE server configuration.
 *
 * ships STUN only (free, sufficient for most peer-to-peer paths).
 * TURN can be added later WITHOUT touching the calling code: set the public
 * env vars below (or, preferably in a future sprint, swap `getIceServers` to
 * fetch short-lived TURN credentials from a server route). Keeping this the one
 * place ICE config lives is deliberate.
 */

const STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

function turnFromEnv(): RTCIceServer[] {
  const urls = process.env.NEXT_PUBLIC_TURN_URL;
  if (!urls) return [];
  const username = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
  return [{ urls, ...(username ? { username } : {}), ...(credential ? { credential } : {}) }];
}

/** The RTCConfiguration handed to every RTCPeerConnection in the app. */
export function getRtcConfig(): RTCConfiguration {
  return {
    iceServers: [...STUN_SERVERS, ...turnFromEnv()],
    // A slightly larger candidate pool warms ICE gathering for faster connects.
    iceCandidatePoolSize: 4,
  };
}

/** True when this browser can actually do WebRTC voice. */
export function isWebRtcSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.RTCPeerConnection !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}
