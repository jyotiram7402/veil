import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://blackfoxx.example";

function boot({ windows = [], subscription = null, api = {} } = {}) {
  const listeners = {};
  const shown = [];
  const opened = [];
  const requests = [];
  const subscribed = [];
  const scope = {
    location: new URL(ORIGIN + "/sw.js"),
    skipped: false,
    claimed: false,
    skipWaiting() {
      scope.skipped = true;
    },
    addEventListener(type, fn) {
      listeners[type] = fn;
    },
    registration: {
      showNotification: async (title, options) => void shown.push({ title, ...options }),
      pushManager: {
        getSubscription: async () => subscription,
        subscribe: async (options) => {
          subscribed.push(options);
          return fakeSubscription("https://fcm.googleapis.com/fcm/send/made-new");
        },
      },
    },
    clients: {
      claim: async () => void (scope.claimed = true),
      matchAll: async (options) => {
        assert.deepEqual(options, { type: "window", includeUncontrolled: true });
        return Object.freeze([...windows]);
      },
      openWindow: async (url) => void opened.push(url),
    },
  };
  const fetch = async (url, init = {}) => {
    requests.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : null });
    const answer = api[url] ?? { status: 200, body: {} };
    return new Response(JSON.stringify(answer.body), { status: answer.status });
  };
  new Function("self", "fetch", source)(scope, fetch);
  async function fire(type, event = {}) {
    const waits = [];
    listeners[type]({ ...event, waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
  }
  return { scope, listeners, shown, opened, requests, subscribed, fire };
}
const pushed = (value) => ({ data: value === undefined ? null : { json: () => (typeof value === "function" ? value() : value) } });
function fakeWindow(path, { canNavigate = true, canFocus = true } = {}) {
  const w = {
    url: ORIGIN + path,
    focused: 0,
    went: [],
    async focus() {
      if (!canFocus) throw new Error("not allowed to focus");
      w.focused++;
      return w;
    },
    async navigate(href) {
      if (!canNavigate) throw new TypeError("not controlled");
      w.went.push(href);
      w.url = href;
      return w;
    },
  };
  return w;
}
function fakeSubscription(endpoint) {
  return { endpoint, toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: "P".repeat(87), auth: "A".repeat(22) } }) };
}
const tap = (url) => {
  const notification = { closed: 0, data: url === undefined ? undefined : { url }, close: () => notification.closed++ };
  return { notification };
};

await test("it takes over at once and handles nothing but pushes (no fetch handler to slow pages)", async () => {
  const sw = boot();
  assert.deepEqual(Object.keys(sw.listeners).sort(), ["activate", "install", "notificationclick", "push", "pushsubscriptionchange"]);
  await sw.fire("install");
  await sw.fire("activate");
  assert.equal(sw.scope.skipped, true);
  assert.equal(sw.scope.claimed, true);
});

await test("a push is shown as it was sent", async () => {
  const sw = boot();
  await sw.fire("push", pushed({ title: "Asha Rao", body: "New message", tag: "chat-1", url: "/chats/1" }));
  assert.deepEqual(sw.shown, [
    { title: "Asha Rao", body: "New message", tag: "chat-1", renotify: true, requireInteraction: false, icon: "/icon-192.png", badge: "/badge-96.png", data: { url: "/chats/1" } },
  ]);
});

await test("an incoming call stays on screen until it is dealt with; nothing else does", async () => {
  let sw = boot();
  await sw.fire("push", pushed({ title: "Incoming voice call", tag: "call-1", url: "/chat", ring: true }));
  assert.equal(sw.shown[0].requireInteraction, true);
  assert.equal(sw.shown[0].tag, "call-1");
  for (const ring of [false, "true", 1, null, undefined, {}]) {
    sw = boot();
    await sw.fire("push", pushed({ title: "Missed voice call", tag: "call-1", url: "/chat", ring }));
    assert.equal(sw.shown[0].requireInteraction, false, String(ring));
  }
});

await test("every push shows something, whatever arrives (an iPhone drops a site that stays silent)", async () => {
  for (const sent of [
    undefined,
    null,
    "just text",
    42,
    [],
    {},
    { title: "" },
    { title: 7, body: {}, tag: null, url: 9 },
    () => {
      throw new SyntaxError("not json");
    },
  ]) {
    const sw = boot();
    await sw.fire("push", pushed(sent));
    assert.equal(sw.shown.length, 1);
    assert.equal(sw.shown[0].title, "New message");
    assert.equal(sw.shown[0].body, "");
    assert.equal(sw.shown[0].tag, "blackfoxx");
    assert.deepEqual(sw.shown[0].data, { url: "/" });
  }
});

await test("a tap brings the open app to the front, and to the right chat", async () => {
  const there = fakeWindow("/chats/1");
  const elsewhere = fakeWindow("/admin");
  let sw = boot({ windows: [elsewhere, there] });
  const event = tap("/chats/1");
  await sw.fire("notificationclick", event);
  assert.equal(event.notification.closed, 1);
  assert.equal(there.focused, 1);
  assert.equal(elsewhere.focused, 0);
  assert.deepEqual(there.went, []);
  assert.deepEqual(sw.opened, []);

  const list = fakeWindow("/chats");
  sw = boot({ windows: [list] });
  await sw.fire("notificationclick", tap("/chats/1"));
  assert.equal(list.focused, 1);
  assert.deepEqual(list.went, [ORIGIN + "/chats/1"]);
  assert.deepEqual(sw.opened, []);
});

await test("with the app closed, a tap opens it", async () => {
  const sw = boot();
  await sw.fire("notificationclick", tap("/chat"));
  assert.deepEqual(sw.opened, [ORIGIN + "/chat"]);
});

await test("a window that cannot be focused or moved does not swallow the tap", async () => {
  const stuck = fakeWindow("/chats", { canNavigate: false });
  let sw = boot({ windows: [stuck] });
  await sw.fire("notificationclick", tap("/chats/1"));
  assert.deepEqual(sw.opened, [ORIGIN + "/chats/1"]);

  const hidden = fakeWindow("/chat", { canFocus: false });
  sw = boot({ windows: [hidden] });
  await sw.fire("notificationclick", tap("/chat"));
  assert.deepEqual(sw.opened, [ORIGIN + "/chat"]);
});

await test("a notification can only ever lead into this app", async () => {
  for (const bad of ["https://evil.example/x", "//evil.example/x", "javascript:alert(1)", "evil", "", undefined, null, 7, {}]) {
    const sw = boot();
    await sw.fire("notificationclick", tap(bad));
    assert.deepEqual(sw.opened, [ORIGIN + "/"], String(bad));
  }
  const sw = boot();
  await sw.fire("notificationclick", { notification: { close() {}, data: undefined } });
  assert.deepEqual(sw.opened, [ORIGIN + "/"]);
});

await test("a replaced subscription is handed to the server, naming the one it replaces", async () => {
  const sw = boot();
  await sw.fire("pushsubscriptionchange", {
    oldSubscription: fakeSubscription("https://fcm.googleapis.com/fcm/send/old"),
    newSubscription: fakeSubscription("https://fcm.googleapis.com/fcm/send/new"),
  });
  assert.deepEqual(sw.requests, [
    {
      url: "/api/push/subscriptions",
      method: "POST",
      body: {
        endpoint: "https://fcm.googleapis.com/fcm/send/new",
        keys: { p256dh: "P".repeat(87), auth: "A".repeat(22) },
        replaces: "https://fcm.googleapis.com/fcm/send/old",
      },
    },
  ]);
  assert.equal(sw.subscribed.length, 0);
});

await test("when the browser only says 'gone', it subscribes again with the server's key", async () => {
  const key = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString("base64url");
  const sw = boot({ api: { "/api/push/key": { status: 200, body: { key } } } });
  await sw.fire("pushsubscriptionchange", { oldSubscription: fakeSubscription("https://fcm.googleapis.com/fcm/send/old") });
  assert.equal(sw.subscribed.length, 1);
  assert.equal(sw.subscribed[0].userVisibleOnly, true);
  assert.equal(Buffer.from(sw.subscribed[0].applicationServerKey).toString("base64url"), key);
  assert.deepEqual(sw.requests.map((r) => [r.method, r.url]), [["GET", "/api/push/key"], ["POST", "/api/push/subscriptions"]]);
  assert.equal(sw.requests[1].body.endpoint, "https://fcm.googleapis.com/fcm/send/made-new");
  assert.equal(sw.requests[1].body.replaces, "https://fcm.googleapis.com/fcm/send/old");
});

await test("renewing gives up quietly when signed out, offline, or with nothing to go on", async () => {
  let sw = boot({ api: { "/api/push/key": { status: 401, body: { error: "Sign in required" } } } });
  await sw.fire("pushsubscriptionchange", {});
  assert.equal(sw.subscribed.length, 0);
  assert.deepEqual(sw.requests.map((r) => r.url), ["/api/push/key"]);

  const same = fakeSubscription("https://fcm.googleapis.com/fcm/send/same");
  sw = boot({ subscription: same });
  await sw.fire("pushsubscriptionchange", { oldSubscription: same });
  assert.equal("replaces" in sw.requests[0].body, false);

  sw = boot();
  sw.scope.registration.pushManager.getSubscription = async () => {
    throw new Error("push is switched off");
  };
  await sw.fire("pushsubscriptionchange", {});
  assert.equal(sw.requests.length, 0);
});

