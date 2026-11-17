const FALLBACK_TITLE = "New message";

const text = (value) => (typeof value === "string" ? value : "");

function readNotice(event) {
  try {
    const sent = event.data ? event.data.json() : null;
    if (sent && typeof sent === "object") return sent;
  } catch {}
  return {};
}

function appUrl(path) {
  const safe = typeof path === "string" && path.startsWith("/") && !path.startsWith("//");
  const url = new URL(safe ? path : "/", self.location.origin);
  return url.origin === self.location.origin ? url : new URL("/", self.location.origin);
}

async function openApp(path) {
  const target = appUrl(path);
  const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const windows = [...open].sort(
    (a, b) =>
      Number(new URL(b.url).pathname === target.pathname) -
      Number(new URL(a.url).pathname === target.pathname),
  );
  for (const client of windows) {
    try {
      const shown = (await client.focus()) || client;
      if (new URL(shown.url).pathname !== target.pathname) await shown.navigate(target.href);
      return;
    } catch {}
  }
  await self.clients.openWindow(target.href);
}

function keyBytes(key) {
  const raw = atob(key.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function renew(event) {
  const old = event.oldSubscription || null;
  let fresh = event.newSubscription || (await self.registration.pushManager.getSubscription());
  if (!fresh) {
    const res = await fetch("/api/push/key", { cache: "no-store" });
    if (!res.ok) return;
    const { key } = await res.json();
    fresh = await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(key),
    });
  }
  const sent = fresh.toJSON();
  await fetch("/api/push/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: sent.endpoint,
      keys: sent.keys,
      replaces: old && old.endpoint !== sent.endpoint ? old.endpoint : undefined,
    }),
  });
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const notice = readNotice(event);
  event.waitUntil(
    self.registration.showNotification(text(notice.title) || FALLBACK_TITLE, {
      body: text(notice.body),
      tag: text(notice.tag) || "blackfoxx",
      renotify: true,
      icon: "/icon-192.png",
      badge: "/badge-96.png",
      data: { url: text(notice.url) || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(openApp(event.notification.data && event.notification.data.url));
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(renew(event).catch(() => undefined));
});
