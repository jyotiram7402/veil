const STUN_ONLY: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const REUSE_MS = 10 * 60_000;
const FETCH_TIMEOUT_MS = 4000;

export type RelayReason = "not_configured" | "rejected" | "unreachable";

export type RelayAnswer = {
  relay: boolean;
  iceServers: RTCIceServer[];
  reason?: RelayReason;
};

function isRelayReason(value: unknown): value is RelayReason {
  return value === "not_configured" || value === "rejected" || value === "unreachable";
}

function cleanIceServers(raw: unknown): RTCIceServer[] {
  if (!Array.isArray(raw)) return [];
  const out: RTCIceServer[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { urls, username, credential } = entry as Record<string, unknown>;
    const list = (Array.isArray(urls) ? urls : [urls]).filter(
      (u): u is string => typeof u === "string" && /^(stun|turns?):/.test(u),
    );
    if (list.length === 0) continue;
    if (list.every((u) => u.startsWith("stun:"))) {
      out.push({ urls: list });
    } else if (typeof username === "string" && typeof credential === "string") {
      out.push({ urls: list, username, credential });
    }
  }
  return out;
}

export async function fetchRelayServers(chatId?: string): Promise<RelayAnswer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const query = chatId ? `?chatId=${encodeURIComponent(chatId)}` : "";
    const res = await fetch(`/api/calls/ice${query}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { relay?: unknown; iceServers?: unknown; reason?: unknown };
    const iceServers = cleanIceServers(body.iceServers);
    const relay = body.relay === true && iceServers.some((s) => s.username);
    return {
      relay,
      iceServers: relay ? iceServers : [],
      ...(isRelayReason(body.reason) ? { reason: body.reason } : {}),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

let reuse: { chatId: string; servers: RTCIceServer[]; at: number } | null = null;
let pending: { chatId: string; promise: Promise<RTCIceServer[]> } | null = null;

async function relayServers(chatId: string): Promise<RTCIceServer[]> {
  if (reuse && reuse.chatId === chatId && Date.now() - reuse.at < REUSE_MS) return reuse.servers;
  if (pending && pending.chatId === chatId) return pending.promise;

  const promise = fetchRelayServers(chatId).then((answer) => {
    if (answer?.relay) reuse = { chatId, servers: answer.iceServers, at: Date.now() };
    return answer?.iceServers ?? [];
  });
  pending = { chatId, promise };
  try {
    return await promise;
  } finally {
    if (pending?.promise === promise) pending = null;
  }
}

export async function getRtcConfig(chatId: string): Promise<RTCConfiguration> {
  const relay = await relayServers(chatId);
  return { iceServers: relay.length > 0 ? relay : STUN_ONLY };
}

export function basicRtcConfig(): RTCConfiguration {
  return { iceServers: STUN_ONLY };
}

export function isWebRtcSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.RTCPeerConnection !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}
