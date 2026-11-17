const STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

function turnFromEnv(): RTCIceServer[] {
  const raw = process.env.NEXT_PUBLIC_TURN_URL;
  if (!raw) return [];
  const urls = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (urls.length === 0) return [];
  const username = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
  return [{ urls, ...(username ? { username } : {}), ...(credential ? { credential } : {}) }];
}

export function getRtcConfig(): RTCConfiguration {
  return {
    iceServers: [...STUN_SERVERS, ...turnFromEnv()],
  };
}

export function isWebRtcSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.RTCPeerConnection !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}
