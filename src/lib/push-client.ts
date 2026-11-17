export type PushStatus = "unsupported" | "install" | "blocked" | "off" | "on";
export type EnableResult = "on" | "blocked" | "dismissed" | "unavailable" | "failed";

const DEVICES_URL = "/api/push/subscriptions";
const JSON_HEADERS = { "Content-Type": "application/json" };
const SIGN_OUT_WAIT_MS = 1500;
const LOOK_WAIT_MS = 1000;

let status: PushStatus | null = null;
let endpoint: string | null = null;
let syncing: Promise<PushStatus> | null = null;
const listeners = new Set<() => void>();

function settle(next: PushStatus, nextEndpoint: string | null): PushStatus {
  const changed = status !== next || endpoint !== nextEndpoint;
  status = next;
  endpoint = nextEndpoint;
  if (changed) for (const listener of [...listeners]) listener();
  return next;
}

export function pushStatus(): PushStatus | null {
  return status;
}

export function pushEndpoint(): string | null {
  return endpoint;
}

export function onPushStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function capable(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function onApplePhone(): boolean {
  const agent = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1);
}

function onHomeScreen(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration("/");
  return registration ? registration.pushManager.getSubscription() : null;
}

async function look(): Promise<{ status: PushStatus; subscription: PushSubscription | null }> {
  if (typeof window === "undefined") return { status: "unsupported", subscription: null };
  if (!capable()) {
    const status = onApplePhone() && !onHomeScreen() ? "install" : "unsupported";
    return { status, subscription: null };
  }
  if (Notification.permission === "denied") return { status: "blocked", subscription: null };
  if (Notification.permission !== "granted") return { status: "off", subscription: null };
  const subscription = await currentSubscription().catch(() => null);
  return { status: subscription ? "on" : "off", subscription };
}

function keyBytes(key: string): Uint8Array<ArrayBuffer> {
  const raw = atob(key.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function madeWith(subscription: PushSubscription, key: Uint8Array): boolean {
  const used = subscription.options?.applicationServerKey;
  if (!used) return true;
  const bytes = new Uint8Array(used);
  return bytes.length === key.length && bytes.every((byte, i) => byte === key[i]);
}

async function subscribeWith(
  registration: ServiceWorkerRegistration,
  key: string,
): Promise<{ subscription: PushSubscription; replaced?: string }> {
  const wanted = keyBytes(key);
  const existing = await registration.pushManager.getSubscription();
  let replaced: string | undefined;
  if (existing) {
    if (madeWith(existing, wanted)) return { subscription: existing };
    replaced = existing.endpoint;
    await existing.unsubscribe();
  }
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: wanted,
  });
  return { subscription, replaced };
}

async function save(
  subscription: PushSubscription,
  replaces?: string,
): Promise<{ ok: true; key: string } | { ok: false; status: number }> {
  const sent = subscription.toJSON();
  const res = await fetch(DEVICES_URL, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ endpoint: sent.endpoint, keys: sent.keys, replaces }),
  });
  if (!res.ok) return { ok: false, status: res.status };
  const body = (await res.json().catch(() => null)) as { key?: unknown } | null;
  return { ok: true, key: typeof body?.key === "string" ? body.key : "" };
}

export function syncPush(): Promise<PushStatus> {
  syncing ??= (async () => {
    const found = await look();
    settle(found.status, found.subscription?.endpoint ?? null);
    if (!found.subscription) return found.status;

    let current = found.subscription;
    try {
      const saved = await save(current);
      if (saved.ok && saved.key && !madeWith(current, keyBytes(saved.key))) {
        const registration = await navigator.serviceWorker.getRegistration("/");
        if (registration) {
          const renewed = await subscribeWith(registration, saved.key);
          current = renewed.subscription;
          await save(current, renewed.replaced);
        }
      }
    } catch {}
    return settle("on", current.endpoint);
  })();
  return syncing;
}

export function pushKnown(): Promise<void> {
  if (status !== null) return Promise.resolve();
  void syncPush();
  return new Promise((done) => {
    const finish = () => {
      stop();
      clearTimeout(timer);
      done();
    };
    const stop = onPushStatus(finish);
    const timer = setTimeout(finish, LOOK_WAIT_MS);
  });
}

export async function refreshPush(): Promise<void> {
  if (!syncing) return;
  await syncing;
  const found = await look();
  settle(found.status, found.subscription?.endpoint ?? null);
}

export async function enablePush(): Promise<EnableResult> {
  if (!capable()) return "failed";

  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch {
    return "failed";
  }
  if (permission === "denied") {
    settle("blocked", null);
    return "blocked";
  }
  if (permission !== "granted") return "dismissed";

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;

    const res = await fetch("/api/push/key", { cache: "no-store" });
    if (!res.ok) {
      settle("off", null);
      return res.status === 503 ? "unavailable" : "failed";
    }
    const { key } = (await res.json()) as { key: string };

    const { subscription, replaced } = await subscribeWith(registration, key);
    const saved = await save(subscription, replaced);
    if (!saved.ok) {
      await subscription.unsubscribe().catch(() => false);
      settle("off", null);
      return saved.status === 503 ? "unavailable" : "failed";
    }
    settle("on", subscription.endpoint);
    return "on";
  } catch {
    const found = await look().catch(() => null);
    settle(found?.status === "blocked" ? "blocked" : "off", null);
    return "failed";
  }
}

export async function disablePush(): Promise<void> {
  if (!capable()) return;
  const subscription = await currentSubscription().catch(() => null);
  if (subscription) {
    await Promise.all([
      fetch(DEVICES_URL, {
        method: "DELETE",
        headers: JSON_HEADERS,
        body: JSON.stringify({ endpoint: subscription.endpoint }),
        keepalive: true,
      }).catch(() => undefined),
      subscription.unsubscribe().catch(() => false),
    ]);
  }
  settle(Notification.permission === "denied" ? "blocked" : "off", null);
}

export function forgetPushDevice(): Promise<void> {
  if (status !== "on") return Promise.resolve();
  return Promise.race([
    disablePush().catch(() => undefined),
    new Promise<void>((done) => setTimeout(done, SIGN_OUT_WAIT_MS)),
  ]);
}

export function clearShownNotifications(): void {
  if (status !== "on" || !capable()) return;
  void navigator.serviceWorker
    .getRegistration("/")
    .then((registration) => registration?.getNotifications())
    .then((shown) => shown?.forEach((notification) => notification.close()))
    .catch(() => undefined);
}
