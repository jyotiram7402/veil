import "server-only";
import { env } from "@/lib/env";

const TURN_TTL_SECONDS = 12 * 60 * 60;
const CLOUDFLARE_TIMEOUT_MS = 3000;

export type IceServer = { urls: string[]; username?: string; credential?: string };

export type TurnResult =
  | { ok: true; iceServers: IceServer[] }
  | { ok: false; reason: "not_configured" | "rejected" | "unreachable" };

function turnKey(): { id: string; token: string } | null {
  const id = env.CLOUDFLARE_TURN_KEY_ID?.trim();
  const token = env.CLOUDFLARE_TURN_API_TOKEN?.trim();
  return id && token ? { id, token } : null;
}

const PREFERRED_TURN_URLS = [
  /:3478\?transport=udp$/,
  /:80\?transport=tcp$/,
  /^turns:.+:443\?transport=tcp$/,
];

function pickTurnUrls(urls: string[]): string[] {
  const usable = urls.filter((u) => !/:53(\?|$)/.test(u));
  const picked = PREFERRED_TURN_URLS.map((re) => usable.find((u) => re.test(u))).filter(
    (u): u is string => typeof u === "string",
  );
  return picked.length > 0 ? picked : usable.slice(0, 3);
}

export function pickIceServers(raw: unknown): IceServer[] {
  const entries = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: IceServer[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const { urls, username, credential } = entry as Record<string, unknown>;
    const all = (Array.isArray(urls) ? urls : [urls]).filter(
      (u): u is string => typeof u === "string",
    );
    const stun = all.filter((u) => u.startsWith("stun:"));
    const turn = pickTurnUrls(all.filter((u) => /^turns?:/.test(u)));
    if (stun.length > 0) out.push({ urls: [stun[0]!] });
    if (turn.length > 0 && typeof username === "string" && typeof credential === "string") {
      out.push({ urls: turn, username, credential });
    }
  }
  return out;
}

export async function createTurnCredentials(): Promise<TurnResult> {
  const key = turnKey();
  if (!key) return { ok: false, reason: "not_configured" };

  let res: Response;
  try {
    res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(key.id)}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ttl: TURN_TTL_SECONDS }),
        cache: "no-store",
        signal: AbortSignal.timeout(CLOUDFLARE_TIMEOUT_MS),
      },
    );
  } catch {
    console.error("[turn] Cloudflare did not answer");
    return { ok: false, reason: "unreachable" };
  }

  if (!res.ok) {
    console.error(`[turn] Cloudflare answered ${res.status}`);
    const refused = res.status >= 400 && res.status < 500 && res.status !== 429;
    return { ok: false, reason: refused ? "rejected" : "unreachable" };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, reason: "unreachable" };
  }
  const iceServers = pickIceServers((body as { iceServers?: unknown } | null)?.iceServers);
  if (!iceServers.some((s) => s.username)) {
    console.error("[turn] Cloudflare answered without a relay server");
    return { ok: false, reason: "unreachable" };
  }
  return { ok: true, iceServers };
}
