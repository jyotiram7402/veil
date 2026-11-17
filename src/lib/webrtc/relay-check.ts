import { fetchRelayServers, isWebRtcSupported, type RelayReason } from "@/lib/webrtc/ice";

export type RelayCheckResult = "ok" | "blocked" | "unsupported" | "error" | RelayReason;

const GATHER_TIMEOUT_MS = 10_000;

export async function checkRelay(): Promise<RelayCheckResult> {
  if (!isWebRtcSupported()) return "unsupported";

  const answer = await fetchRelayServers();
  if (!answer) return "error";
  if (!answer.relay) return answer.reason ?? "not_configured";

  let pc: RTCPeerConnection | null = null;
  try {
    const conn = new RTCPeerConnection({
      iceServers: answer.iceServers,
      iceTransportPolicy: "relay",
    });
    pc = conn;

    const reached = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), GATHER_TIMEOUT_MS);
      conn.onicecandidate = (e) => {
        if (e.candidate && !/ typ relay/.test(e.candidate.candidate)) return;
        clearTimeout(timer);
        resolve(e.candidate !== null);
      };
    });

    conn.createDataChannel("relay-check");
    await conn.setLocalDescription(await conn.createOffer());
    return (await reached) ? "ok" : "blocked";
  } catch {
    return "blocked";
  } finally {
    pc?.close();
  }
}
