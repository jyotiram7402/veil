import assert from "node:assert/strict";
import { test } from "node:test";

let copy = 0;
const loadPage = () => import(new URL("../src/lib/push-client.ts", import.meta.url).href + `?page=${++copy}`);

const KEY_A = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString("base64url");
const KEY_B = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 2)]).toString("base64url");
const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36";

let log;
let browser;
function makeSubscription(endpoint, key, { withOptions = true } = {}) {
  const sub = {
    endpoint,
    options: withOptions ? { applicationServerKey: key ? Uint8Array.from(Buffer.from(key, "base64url")).buffer : null } : undefined,
    gone: false,
    toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: "P".repeat(87), auth: "A".repeat(22) } }),
    async unsubscribe() {
      log.push(`unsubscribe ${endpoint.split("/").pop()}`);
      sub.gone = true;
      if (browser.subscription === sub) browser.subscription = null;
      return true;
    },
  };
  return sub;
}

function open({
  agent = ANDROID,
  touchPoints = 5,
  push = true,
  worker = true,
  standalone = false,
  permission = "default",
  answer = "granted",
  subscription = null,
  registered = subscription !== null,
  serverKey = KEY_A,
  server = {},
  subscribeFails = false,
} = {}) {
  log = [];
  browser = { permission, subscription, registered, shown: [], serverKey, server, hang: false };
  const registration = {
    pushManager: {
      getSubscription: async () => browser.subscription,
      subscribe: async (options) => {
        if (subscribeFails) throw new Error("push service unreachable");
        assert.equal(options.userVisibleOnly, true);
        const key = Buffer.from(options.applicationServerKey).toString("base64url");
        log.push(`subscribe with ${key === KEY_A ? "A" : key === KEY_B ? "B" : key}`);
        browser.subscription = makeSubscription(`https://fcm.googleapis.com/fcm/send/new${log.length}`, key);
        return browser.subscription;
      },
    },
    getNotifications: async () => browser.shown,
  };
  const navigator = { userAgent: agent, maxTouchPoints: touchPoints, standalone: standalone && /iPhone|Macintosh/.test(agent) ? true : undefined };
  if (worker) {
    navigator.serviceWorker = {
      getRegistration: async (scope) => {
        assert.equal(scope, "/");
        return browser.registered ? registration : undefined;
      },
      register: async (script, options) => {
        log.push(`register ${script} ${options.scope}`);
        browser.registered = true;
        return registration;
      },
      ready: Promise.resolve(registration),
    };
  }
  const window = { matchMedia: (q) => ({ matches: q === "(display-mode: standalone)" && standalone }) };
  const Notification = {
    get permission() {
      return browser.permission;
    },
    requestPermission: async () => {
      log.push("ask permission");
      if (browser.permission === "default" && answer !== "ignored") browser.permission = answer;
      return browser.permission;
    },
  };
  if (push && worker) {
    window.PushManager = function PushManager() {};
    window.Notification = Notification;
    globalThis.Notification = Notification;
  } else {
    delete globalThis.Notification;
  }
  if (worker) window.serviceWorker = navigator.serviceWorker;
  Object.defineProperty(globalThis, "navigator", { value: navigator, configurable: true, writable: true });
  globalThis.window = window;
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body) : null;
    log.push(`${method} ${url}${body ? " " + JSON.stringify({ ...body, endpoint: body.endpoint?.split("/").pop(), replaces: body.replaces?.split("/").pop(), keys: body.keys ? "keys" : undefined }) : ""}`);
    if (browser.hang) return new Promise(() => {});
    const status = browser.server[`${method} ${url}`] ?? 200;
    if (status === "down") throw new TypeError("Failed to fetch");
    const answerBody = url === "/api/push/key" || method === "POST" ? { ok: true, key: browser.serverKey } : { ok: true };
    return new Response(JSON.stringify(status === 200 ? answerBody : { error: "no" }), { status });
  };
}

await test("what each kind of browser is told", async () => {
  open({ worker: false });
  assert.equal(await (await loadPage()).syncPush(), "unsupported");
  open({ agent: PHONE, push: false });
  assert.equal(await (await loadPage()).syncPush(), "install");
  open({ agent: IPAD, touchPoints: 5, push: false });
  assert.equal(await (await loadPage()).syncPush(), "install");
  open({ agent: IPAD, touchPoints: 0, push: false });
  assert.equal(await (await loadPage()).syncPush(), "unsupported", "a real Mac without push");
  open({ agent: PHONE, push: false, standalone: true });
  assert.equal(await (await loadPage()).syncPush(), "unsupported", "on the Home Screen of an old iPhone");
  open({ agent: PHONE, standalone: true });
  assert.equal(await (await loadPage()).syncPush(), "off", "on the Home Screen of a current iPhone");
  open({ permission: "denied" });
  assert.equal(await (await loadPage()).syncPush(), "blocked");
  open({ permission: "default" });
  assert.equal(await (await loadPage()).syncPush(), "off");
  open({ permission: "granted" });
  assert.equal(await (await loadPage()).syncPush(), "off");
  assert.deepEqual(log, [], "a browser that never asked for notifications costs no request");
});

await test("before the page has looked, nothing is claimed", async () => {
  open();
  const page = await loadPage();
  assert.equal(page.pushStatus(), null);
  assert.equal(page.pushEndpoint(), null);
});

await test("turning on: ask first, then worker, key, subscription, server", async () => {
  open();
  const page = await loadPage();
  await page.syncPush();
  const heard = [];
  page.onPushStatus(() => heard.push(page.pushStatus()));
  const started = page.enablePush();
  assert.deepEqual(log, ["ask permission"], "the question is asked inside the tap itself");
  assert.equal(await started, "on");
  assert.deepEqual(log, [
    "ask permission",
    "register /sw.js /",
    "GET /api/push/key",
    "subscribe with A",
    `POST /api/push/subscriptions {"endpoint":"new4","keys":"keys"}`,
  ]);
  assert.equal(page.pushStatus(), "on");
  assert.equal(page.pushEndpoint(), browser.subscription.endpoint);
  assert.deepEqual(heard, ["on"]);
});

await test("saying no, or closing the question, is respected", async () => {
  open({ answer: "denied" });
  let page = await loadPage();
  await page.syncPush();
  assert.equal(await page.enablePush(), "blocked");
  assert.equal(page.pushStatus(), "blocked");
  assert.deepEqual(log, ["ask permission"]);

  open({ answer: "ignored" });
  page = await loadPage();
  await page.syncPush();
  assert.equal(await page.enablePush(), "dismissed");
  assert.equal(page.pushStatus(), "off");
  assert.deepEqual(log, ["ask permission"]);
});

await test("a server that is not ready, or fails, leaves nothing half switched on", async () => {
  open({ server: { "GET /api/push/key": 503 } });
  let page = await loadPage();
  await page.syncPush();
  assert.equal(await page.enablePush(), "unavailable");
  assert.equal(browser.subscription, null);
  assert.equal(page.pushStatus(), "off");

  open({ server: { "POST /api/push/subscriptions": 503 } });
  page = await loadPage();
  await page.syncPush();
  assert.equal(await page.enablePush(), "unavailable");
  assert.equal(browser.subscription, null, "the browser's subscription is given back");
  assert.equal(page.pushStatus(), "off");

  open({ server: { "POST /api/push/subscriptions": 500 } });
  page = await loadPage();
  await page.syncPush();
  assert.equal(await page.enablePush(), "failed");
  assert.equal(browser.subscription, null);
  assert.equal(page.pushEndpoint(), null);

  open({ server: { "GET /api/push/key": "down" } });
  page = await loadPage();
  await page.syncPush();
  assert.equal(await page.enablePush(), "failed");
  assert.equal(page.pushStatus(), "off");

  open({ subscribeFails: true });
  page = await loadPage();
  await page.syncPush();
  assert.equal(await page.enablePush(), "failed");
  assert.equal(page.pushStatus(), "off");
});

await test("every page load tells the server once which device this is", async () => {
  open({ permission: "granted", subscription: makeSubscription("https://fcm.googleapis.com/fcm/send/mine", KEY_A) });
  const page = await loadPage();
  const [a, b] = await Promise.all([page.syncPush(), page.syncPush()]);
  assert.equal(a, "on");
  assert.equal(b, "on");
  assert.deepEqual(log, [`POST /api/push/subscriptions {"endpoint":"mine","keys":"keys"}`]);
  assert.equal(page.pushEndpoint(), "https://fcm.googleapis.com/fcm/send/mine");
  await page.syncPush();
  assert.equal(log.length, 1);
});

await test("a device stays on when the server cannot be reached at load", async () => {
  open({
    permission: "granted",
    subscription: makeSubscription("https://fcm.googleapis.com/fcm/send/mine", KEY_A),
    server: { "POST /api/push/subscriptions": "down" },
  });
  const page = await loadPage();
  assert.equal(await page.syncPush(), "on");
  assert.equal(page.pushEndpoint(), "https://fcm.googleapis.com/fcm/send/mine");
  assert.equal(browser.subscription.gone, false);
});

await test("a subscription made for an older server key is renewed by itself", async () => {
  open({
    permission: "granted",
    subscription: makeSubscription("https://fcm.googleapis.com/fcm/send/old", KEY_A),
    serverKey: KEY_B,
  });
  const page = await loadPage();
  assert.equal(await page.syncPush(), "on");
  assert.deepEqual(log, [
    `POST /api/push/subscriptions {"endpoint":"old","keys":"keys"}`,
    "unsubscribe old",
    "subscribe with B",
    `POST /api/push/subscriptions {"endpoint":"new3","keys":"keys","replaces":"old"}`,
  ]);
  assert.equal(page.pushEndpoint(), browser.subscription.endpoint);

  open({
    permission: "granted",
    subscription: makeSubscription("https://fcm.googleapis.com/fcm/send/unknown", KEY_A, { withOptions: false }),
    serverKey: KEY_B,
  });
  const other = await loadPage();
  assert.equal(await other.syncPush(), "on");
  assert.equal(log.length, 1, "a browser that does not say which key it used is left alone");
});

await test("turning on again with a live subscription does not make a second one", async () => {
  open({ permission: "granted", subscription: makeSubscription("https://fcm.googleapis.com/fcm/send/mine", KEY_A) });
  const page = await loadPage();
  await page.syncPush();
  log.length = 0;
  assert.equal(await page.enablePush(), "on");
  assert.deepEqual(log, [
    "ask permission",
    "register /sw.js /",
    "GET /api/push/key",
    `POST /api/push/subscriptions {"endpoint":"mine","keys":"keys"}`,
  ]);
});

await test("turning off removes the device here and on the server", async () => {
  open({ permission: "granted", subscription: makeSubscription("https://fcm.googleapis.com/fcm/send/mine", KEY_A) });
  const page = await loadPage();
  await page.syncPush();
  log.length = 0;
  await page.disablePush();
  assert.deepEqual(log.sort(), [`DELETE /api/push/subscriptions {"endpoint":"mine"}`, "unsubscribe mine"]);
  assert.equal(page.pushStatus(), "off");
  assert.equal(page.pushEndpoint(), null);
  assert.equal(browser.subscription, null);

  open({
    permission: "granted",
    subscription: makeSubscription("https://fcm.googleapis.com/fcm/send/mine", KEY_A),
    server: { "DELETE /api/push/subscriptions": "down" },
  });
  const offline = await loadPage();
  await offline.syncPush();
  await offline.disablePush();
  assert.equal(browser.subscription, null, "offline: the browser still stops listening");
  assert.equal(offline.pushStatus(), "off");
});

await test("signing out forgets the device, and never holds the sign-out up for long", async () => {
  open({ permission: "granted", subscription: makeSubscription("https://fcm.googleapis.com/fcm/send/mine", KEY_A) });
  let page = await loadPage();
  await page.syncPush();
  log.length = 0;
  await page.forgetPushDevice();
  assert.equal(log.length, 2);
  assert.equal(browser.subscription, null);

  open();
  page = await loadPage();
  await page.syncPush();
  await page.forgetPushDevice();
  assert.deepEqual(log, [], "nothing to forget when notifications were never on");

  open({ permission: "granted", subscription: makeSubscription("https://fcm.googleapis.com/fcm/send/mine", KEY_A) });
  page = await loadPage();
  await page.syncPush();
  browser.hang = true;
  const started = Date.now();
  await page.forgetPushDevice();
  const took = Date.now() - started;
  assert.ok(took >= 1400 && took < 2500, `waited ${took} ms`);
});

await test("opening the app clears the notifications it has shown, only when they are on", async () => {
  const note = () => {
    const n = { closed: 0, close: () => n.closed++ };
    return n;
  };
  open({ permission: "granted", subscription: makeSubscription("https://fcm.googleapis.com/fcm/send/mine", KEY_A) });
  let page = await loadPage();
  browser.shown = [note(), note()];
  page.clearShownNotifications();
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(browser.shown.map((s) => s.closed), [0, 0], "not before the page knows its state");
  await page.syncPush();
  page.clearShownNotifications();
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(browser.shown.map((s) => s.closed), [1, 1]);
});

await test("coming back after changing the browser's setting is noticed", async () => {
  open({ permission: "denied" });
  const page = await loadPage();
  await page.refreshPush();
  assert.equal(page.pushStatus(), null, "no re-check before the first look");
  await page.syncPush();
  assert.equal(page.pushStatus(), "blocked");
  browser.permission = "default";
  await page.refreshPush();
  assert.equal(page.pushStatus(), "off");
  browser.permission = "denied";
  await page.refreshPush();
  assert.equal(page.pushStatus(), "blocked");
});

