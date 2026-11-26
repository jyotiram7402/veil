import assert from "node:assert/strict";
import { test } from "node:test";
import { createDecipheriv, createECDH, hkdfSync } from "node:crypto";

let copy = 0;
const freshServer = () => import(new URL("../src/lib/push.ts", import.meta.url).href + `?server=${++copy}`);

const ORIGIN = "https://blackfoxx.example";
const CHAT = "3f0c0b0e-0000-4000-8000-00000000c4a7";
const ADMIN = "admin-id";
const ASHA = "asha-id";
const RAVI = "ravi-id";

function phone(name) {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = Buffer.from((name + "0123456789abcdef").slice(0, 16));
  const endpoint = `https://fcm.googleapis.com/fcm/send/${name}`;
  return {
    name,
    endpoint,
    target: { endpoint, p256dh: ecdh.getPublicKey().toString("base64url"), auth: auth.toString("base64url") },
    read(body) {
      const salt = body.subarray(0, 16);
      const idLength = body.readUInt8(20);
      const asPublic = body.subarray(21, 21 + idLength);
      const sealed = body.subarray(21 + idLength);
      const shared = ecdh.computeSecret(asPublic);
      const info = Buffer.concat([Buffer.from("WebPush: info\0"), ecdh.getPublicKey(), asPublic]);
      const ikm = Buffer.from(hkdfSync("sha256", shared, auth, info, 32));
      const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
      const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
      const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
      decipher.setAuthTag(sealed.subarray(sealed.length - 16));
      const padded = Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - 16)), decipher.final()]);
      return JSON.parse(padded.subarray(0, padded.lastIndexOf(2)).toString());
    },
  };
}

const person = (id, username, display_name, extra = {}) => ({
  id, username, display_name, is_admin: false, suspended: false, archived: false, ...extra,
});

let phones;
let pushes;
function world({ chatType = "direct", members = [ADMIN, ASHA], migrated = true } = {}) {
  const profiles = [
    person(ADMIN, "jay", "Jay", { is_admin: true }),
    person(ASHA, "asha", "Asha Rao"),
    person(RAVI, "ravi", null),
  ];
  let tick = 0;
  globalThis.__db = {
    calls: [],
    clock: () => new Date(Date.UTC(2026, 10, 17, 6, 0, tick++)).toISOString(),
    tables: {
      profiles,
      chat_members: members.map((id) => ({
        chat_id: CHAT,
        user_id: id,
        blocked: false,
        removed_at: null,
        chat: { type: chatType },
        user: profiles.find((p) => p.id === id),
      })),
      ...(migrated ? { push_subscriptions: [], push_keys: [] } : {}),
    },
  };
  globalThis.__env = { APP_URL: "http://localhost:3000", INTERNAL_EMAIL_DOMAIN: "rooms.local" };
  phones = new Map();
  pushes = [];
  globalThis.fetch = async (url, init) => {
    const answer = globalThis.__service?.(String(url)) ?? 201;
    if (answer === "down") throw new Error("no route");
    const device = phones.get(String(url));
    pushes.push({ to: device?.name ?? String(url), headers: init.headers, notice: device ? device.read(Buffer.from(init.body)) : null });
    return new Response("", { status: answer });
  };
  globalThis.__service = null;
  return globalThis.__db;
}
async function give(push, userId, name, seenSecondsAgo) {
  const device = phone(name);
  phones.set(device.endpoint, device);
  assert.equal(await push.saveDevice(userId, device.target), true);
  if (seenSecondsAgo !== undefined) {
    const row = globalThis.__db.tables.push_subscriptions.find((r) => r.endpoint === device.endpoint);
    row.seen_at = new Date(Date.now() - seenSecondsAgo * 1000).toISOString();
  }
  return device;
}
const devices = () => globalThis.__db.tables.push_subscriptions;
const quiet = async (fn) => {
  const keep = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = keep;
  }
};
const claims = (headers) => JSON.parse(Buffer.from(headers.Authorization.split(".")[1], "base64url").toString());

await test("the server makes its key pair once, and every later start reads the same one", async () => {
  const db = world();
  const first = await (await freshServer()).getPushKeys();
  assert.match(first.publicKey, /^[A-Za-z0-9_-]{87}$/);
  assert.equal(db.tables.push_keys.length, 1);
  assert.equal(db.tables.push_keys[0].id, 1);
  const second = await (await freshServer()).getPushKeys();
  assert.deepEqual(second, first);
  assert.equal(db.tables.push_keys.length, 1);

  const server = await freshServer();
  await server.getPushKeys();
  const before = db.calls.length;
  await server.getPushKeys();
  assert.equal(db.calls.length, before, "a running server does not ask the database again");
});

await test("two servers starting at the same moment end up with one key pair", async () => {
  const db = world();
  const [a, b] = await Promise.all([freshServer(), freshServer()]);
  const [ka, kb] = await Promise.all([a.getPushKeys(), b.getPushKeys()]);
  assert.deepEqual(ka, kb);
  assert.equal(db.tables.push_keys.length, 1);
});

await test("before the migration has been run: no keys, nothing saved, nothing sent, nothing thrown", async () => {
  world({ migrated: false });
  const push = await freshServer();
  assert.equal(await push.getPushKeys(), null);
  assert.equal(await push.saveDevice(ASHA, phone("a1").target), false);
  await push.markDevice(ASHA, "https://fcm.googleapis.com/fcm/send/a1", true);
  await push.removeDevice(ASHA, "https://fcm.googleapis.com/fcm/send/a1");
  await push.notifyNewMessage(CHAT, ADMIN, ORIGIN);
  await push.notifyMissedCall({ chatId: CHAT, callerId: ADMIN, calleeId: ASHA, kind: "voice" }, ORIGIN);
  assert.equal(pushes.length, 0);
});

await test("a device is stored once; coming back keeps its 'app is open' mark", async () => {
  world();
  const push = await freshServer();
  const a1 = await give(push, ASHA, "a1");
  assert.equal(devices().length, 1);
  assert.equal(devices()[0].user_id, ASHA);
  assert.equal(devices()[0].seen_at, null);

  await push.markDevice(ASHA, a1.endpoint, true);
  const seen = devices()[0].seen_at;
  assert.ok(Date.now() - Date.parse(seen) < 2000);
  assert.equal(await push.saveDevice(ASHA, { ...a1.target, auth: "AAAAAAAAAAAAAAAAAAAAAA" }), true);
  assert.equal(devices().length, 1);
  assert.equal(devices()[0].auth, "AAAAAAAAAAAAAAAAAAAAAA");
  assert.equal(devices()[0].seen_at, seen);

  await push.markDevice(ASHA, a1.endpoint, false);
  assert.equal(devices()[0].seen_at, null);
});

await test("only the owner can mark or remove a device", async () => {
  world();
  const push = await freshServer();
  const a1 = await give(push, ASHA, "a1");
  await push.markDevice(RAVI, a1.endpoint, true);
  assert.equal(devices()[0].seen_at, null);
  await push.removeDevice(RAVI, a1.endpoint);
  assert.equal(devices().length, 1);
  await push.removeDevice(ASHA, a1.endpoint);
  assert.equal(devices().length, 0);
});

await test("the next person to sign in on a browser takes its notifications over", async () => {
  world();
  const push = await freshServer();
  const shared = await give(push, ASHA, "tablet");
  assert.equal(await push.saveDevice(RAVI, shared.target), true);
  assert.equal(devices().length, 1);
  assert.equal(devices()[0].user_id, RAVI);
});

await test("a renewed address replaces the old one, but only the person's own", async () => {
  world();
  const push = await freshServer();
  const old = await give(push, ASHA, "old");
  const others = await give(push, RAVI, "ravis");
  const renewed = phone("new");
  assert.equal(await push.saveDevice(ASHA, renewed.target, old.endpoint), true);
  assert.deepEqual(devices().map((d) => d.endpoint).sort(), [renewed.endpoint, others.endpoint].sort());
  const again = phone("newer");
  assert.equal(await push.saveDevice(ASHA, again.target, others.endpoint), true);
  assert.ok(devices().some((d) => d.endpoint === others.endpoint), "someone else's device stays");
});

await test("a person keeps at most ten devices; the oldest goes first", async () => {
  world();
  const push = await freshServer();
  for (let i = 1; i <= 12; i++) await give(push, ASHA, `p${String(i).padStart(2, "0")}`);
  await give(push, RAVI, "ravis");
  const ashas = devices().filter((d) => d.user_id === ASHA).map((d) => d.endpoint.slice(-3)).sort();
  assert.deepEqual(ashas, ["p03", "p04", "p05", "p06", "p07", "p08", "p09", "p10", "p11", "p12"]);
  assert.equal(devices().filter((d) => d.user_id === RAVI).length, 1);
});

await test("a member writes: the admin's devices are told who, never what; the sender hears nothing", async () => {
  world();
  const push = await freshServer();
  await give(push, ADMIN, "adminphone");
  await give(push, ADMIN, "adminlaptop");
  await give(push, ASHA, "ashaphone");
  await push.notifyNewMessage(CHAT, ASHA, ORIGIN);
  assert.deepEqual(pushes.map((p) => p.to).sort(), ["adminlaptop", "adminphone"]);
  for (const p of pushes) {
    assert.deepEqual(p.notice, { title: "Asha Rao", body: "New message", tag: `chat-${CHAT}`, url: `/chats/${CHAT}` });
    assert.equal(p.headers.TTL, "86400");
    assert.equal(p.headers.Urgency, "high");
    assert.match(p.headers.Topic, /^[A-Za-z0-9_-]{32}$/);
    assert.equal(claims(p.headers).aud, "https://fcm.googleapis.com");
    assert.equal(claims(p.headers).sub, ORIGIN);
  }
});

await test("the admin writes: the member's phone says 'New message' and names nobody", async () => {
  world();
  const push = await freshServer();
  await give(push, ADMIN, "adminphone");
  await give(push, ASHA, "ashaphone");
  await push.notifyNewMessage(CHAT, ADMIN, ORIGIN);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].to, "ashaphone");
  assert.deepEqual(pushes[0].notice, { title: "New message", tag: `chat-${CHAT}`, url: "/chat" });
  assert.equal(JSON.stringify(pushes[0].notice).includes("Jay"), false);
});

await test("someone without a display name is called by their username", async () => {
  world({ members: [ADMIN, RAVI] });
  const push = await freshServer();
  await give(push, ADMIN, "adminphone");
  await push.notifyNewMessage(CHAT, RAVI, ORIGIN);
  assert.equal(pushes[0].notice.title, "ravi");
});

await test("a device with the app open and in front is left alone; a closed or stale one is not", async () => {
  world();
  const push = await freshServer();
  await give(push, ADMIN, "open-now", 5);
  await give(push, ADMIN, "open-40s", 40);
  await give(push, ADMIN, "stale-50s", 50);
  await give(push, ADMIN, "stale-1h", 3600);
  await give(push, ADMIN, "closed");
  await push.notifyNewMessage(CHAT, ASHA, ORIGIN);
  assert.deepEqual(pushes.map((p) => p.to).sort(), ["closed", "stale-1h", "stale-50s"]);
});

await test("leaving the app (the away mark) lets notifications through at once", async () => {
  world();
  const push = await freshServer();
  const a = await give(push, ADMIN, "phone", 2);
  await push.notifyNewMessage(CHAT, ASHA, ORIGIN);
  assert.equal(pushes.length, 0);
  await push.markDevice(ADMIN, a.endpoint, false);
  await push.notifyNewMessage(CHAT, ASHA, ORIGIN);
  assert.equal(pushes.length, 1);
});

await test("suspended, archived, blocked and removed people get nothing", async () => {
  for (const change of [
    (db) => (db.tables.profiles.find((p) => p.id === ASHA).suspended = true),
    (db) => (db.tables.profiles.find((p) => p.id === ASHA).archived = true),
    (db) => (db.tables.chat_members.find((m) => m.user_id === ASHA).blocked = true),
    (db) => (db.tables.chat_members.find((m) => m.user_id === ASHA).removed_at = "2026-11-01T00:00:00Z"),
  ]) {
    const db = world();
    const push = await freshServer();
    await give(push, ASHA, "ashaphone");
    change(db);
    await push.notifyNewMessage(CHAT, ADMIN, ORIGIN);
    assert.equal(pushes.length, 0);
  }
});

await test("rooms send nothing; in a group only the admin is told; members never hear about each other", async () => {
  world({ chatType: "room", members: [ADMIN, ASHA, RAVI] });
  let push = await freshServer();
  await give(push, ADMIN, "adminphone");
  await give(push, ASHA, "ashaphone");
  await push.notifyNewMessage(CHAT, RAVI, ORIGIN);
  assert.equal(pushes.length, 0);

  world({ chatType: "group", members: [ADMIN, ASHA, RAVI] });
  push = await freshServer();
  await give(push, ADMIN, "adminphone");
  await give(push, ASHA, "ashaphone");
  await push.notifyNewMessage(CHAT, RAVI, ORIGIN);
  assert.deepEqual(pushes.map((p) => p.to), ["adminphone"]);
  pushes.length = 0;
  await push.notifyNewMessage(CHAT, ADMIN, ORIGIN);
  assert.equal(pushes.length, 0);

  world({ chatType: "direct", members: [ASHA, RAVI] });
  push = await freshServer();
  await give(push, ASHA, "ashaphone");
  await push.notifyNewMessage(CHAT, RAVI, ORIGIN);
  assert.equal(pushes.length, 0);
});

await test("a chat that does not exist, or a sender who is not in it, sends nothing wrong", async () => {
  world();
  const push = await freshServer();
  await give(push, ADMIN, "adminphone");
  await push.notifyNewMessage("no-such-chat", ASHA, ORIGIN);
  assert.equal(pushes.length, 0);
  await push.notifyNewMessage(CHAT, "stranger", ORIGIN);
  assert.equal(pushes[0].notice.title, "Someone");
});

await test("a device the push service no longer knows is forgotten; a hiccup keeps it", async () => {
  world();
  const push = await freshServer();
  const dead = await give(push, ADMIN, "dead");
  const flaky = await give(push, ADMIN, "flaky");
  const fine = await give(push, ADMIN, "fine");
  globalThis.__service = (url) => (url === dead.endpoint ? 410 : url === flaky.endpoint ? 500 : 201);
  await quiet(() => push.notifyNewMessage(CHAT, ASHA, ORIGIN));
  assert.deepEqual(devices().map((d) => d.endpoint).sort(), [fine.endpoint, flaky.endpoint].sort());
});

await test("nothing is thrown when the push service or the database is down", async () => {
  const db = world();
  const push = await freshServer();
  await give(push, ADMIN, "adminphone");
  await push.getPushKeys();
  globalThis.__service = () => "down";
  await push.notifyNewMessage(CHAT, ASHA, ORIGIN);
  assert.equal(devices().length, 1);
  db.down = true;
  await push.notifyNewMessage(CHAT, ASHA, ORIGIN);
  await push.notifyMissedCall({ chatId: CHAT, callerId: ASHA, calleeId: ADMIN, kind: "voice" }, ORIGIN);
});

await test("a missed call: the member reads what kind, the admin also reads who", async () => {
  world();
  const push = await freshServer();
  await give(push, ADMIN, "adminphone");
  await give(push, ASHA, "ashaphone");
  await push.notifyMissedCall({ chatId: CHAT, callerId: ADMIN, calleeId: ASHA, kind: "voice" }, ORIGIN);
  await push.notifyMissedCall({ chatId: CHAT, callerId: ADMIN, calleeId: ASHA, kind: "video" }, ORIGIN);
  await push.notifyMissedCall({ chatId: CHAT, callerId: ASHA, calleeId: ADMIN, kind: "video" }, ORIGIN);
  assert.deepEqual(pushes.map((p) => [p.to, p.notice]), [
    ["ashaphone", { title: "Missed voice call", tag: `call-${CHAT}`, url: "/chat" }],
    ["ashaphone", { title: "Missed video call", tag: `call-${CHAT}`, url: "/chat" }],
    ["adminphone", { title: "Asha Rao", body: "Missed video call", tag: `call-${CHAT}`, url: `/chats/${CHAT}` }],
  ]);
});

await test("a missed call is not announced to a suspended person, an open app, or between two members", async () => {
  let db = world();
  let push = await freshServer();
  await give(push, ASHA, "ashaphone");
  db.tables.profiles.find((p) => p.id === ASHA).suspended = true;
  await push.notifyMissedCall({ chatId: CHAT, callerId: ADMIN, calleeId: ASHA, kind: "voice" }, ORIGIN);
  assert.equal(pushes.length, 0);

  world();
  push = await freshServer();
  await give(push, ASHA, "ashaphone", 3);
  await push.notifyMissedCall({ chatId: CHAT, callerId: ADMIN, calleeId: ASHA, kind: "voice" }, ORIGIN);
  assert.equal(pushes.length, 0);

  world();
  push = await freshServer();
  await give(push, ASHA, "ashaphone");
  await push.notifyMissedCall({ chatId: CHAT, callerId: RAVI, calleeId: ASHA, kind: "voice" }, ORIGIN);
  await push.notifyMissedCall({ chatId: CHAT, callerId: "nobody", calleeId: ASHA, kind: "voice" }, ORIGIN);
  assert.equal(pushes.length, 0);
});

await test("the sender names itself to the push service with a proper contact address", async () => {
  world();
  const push = await freshServer();
  await give(push, ADMIN, "adminphone");
  await push.notifyNewMessage(CHAT, ASHA, "http://localhost:3000");
  assert.equal(claims(pushes[0].headers).sub, "mailto:push@rooms.local");
  globalThis.__env.APP_URL = "https://app.example";
  await push.notifyNewMessage(CHAT, ASHA, "http://localhost:3000");
  assert.equal(claims(pushes[1].headers).sub, "https://app.example");
});

const ring = (callerId, extra = {}) => ({ callId: "call-1", chatId: CHAT, callerId, kind: "voice", ...extra });

await test("an incoming call: the member's phone says what kind and names nobody, the admin's says who", async () => {
  world();
  const push = await freshServer();
  await give(push, ADMIN, "adminphone");
  await give(push, ASHA, "ashaphone");
  await push.notifyIncomingCall(ring(ADMIN), ORIGIN);
  await push.notifyIncomingCall(ring(ADMIN, { kind: "video" }), ORIGIN);
  await push.notifyIncomingCall(ring(ASHA), ORIGIN);
  assert.deepEqual(pushes.map((p) => [p.to, p.notice]), [
    ["ashaphone", { title: "Incoming voice call", tag: `call-${CHAT}`, url: "/chat", ring: true }],
    ["ashaphone", { title: "Incoming video call", tag: `call-${CHAT}`, url: "/chat", ring: true }],
    ["adminphone", { title: "Asha Rao", body: "Incoming voice call", tag: `call-${CHAT}`, url: `/chats/${CHAT}`, ring: true }],
  ]);
});

await test("a ringing call is only worth its ring time, and a missed call replaces it at the push service", async () => {
  world();
  const push = await freshServer();
  await give(push, ASHA, "ashaphone");
  await push.notifyIncomingCall(ring(ADMIN), ORIGIN);
  await push.notifyMissedCall({ chatId: CHAT, callerId: ADMIN, calleeId: ASHA, kind: "voice" }, ORIGIN);
  assert.equal(pushes[0].headers.TTL, "45");
  assert.equal(pushes[0].headers.Urgency, "high");
  assert.equal(pushes[1].headers.TTL, "86400");
  assert.equal(pushes[0].headers.Topic, pushes[1].headers.Topic);
  assert.equal(pushes[0].notice.tag, pushes[1].notice.tag);
});

await test("an incoming call skips a device with the app in front, and every device of the caller", async () => {
  world();
  const push = await freshServer();
  await give(push, ASHA, "open-now", 5);
  await give(push, ASHA, "pocket");
  await give(push, ADMIN, "adminphone");
  await give(push, ADMIN, "adminlaptop");
  await push.notifyIncomingCall(ring(ADMIN), ORIGIN);
  assert.deepEqual(pushes.map((p) => p.to), ["pocket"]);
});

await test("only someone in the chat can make another person's phone ring", async () => {
  world();
  let push = await freshServer();
  await give(push, ADMIN, "adminphone");
  await give(push, ASHA, "ashaphone");
  await push.notifyIncomingCall(ring(RAVI), ORIGIN);
  await push.notifyIncomingCall(ring("stranger"), ORIGIN);
  await push.notifyIncomingCall({ ...ring(ADMIN), chatId: "no-such-chat" }, ORIGIN);
  assert.equal(pushes.length, 0);

  world({ chatType: "group", members: [ADMIN, ASHA, RAVI] });
  push = await freshServer();
  await give(push, ADMIN, "adminphone");
  await give(push, ASHA, "ashaphone");
  await push.notifyIncomingCall(ring(ADMIN), ORIGIN);
  await push.notifyIncomingCall(ring(ASHA), ORIGIN);
  assert.equal(pushes.length, 0, "calls are one-to-one; a group never rings");

  world({ chatType: "room", members: [ADMIN, ASHA] });
  push = await freshServer();
  await give(push, ASHA, "ashaphone");
  await push.notifyIncomingCall(ring(ADMIN), ORIGIN);
  assert.equal(pushes.length, 0);

  world({ members: [ASHA, RAVI] });
  push = await freshServer();
  await give(push, ASHA, "ashaphone");
  await give(push, RAVI, "raviphone");
  await push.notifyIncomingCall(ring(RAVI), ORIGIN);
  assert.equal(pushes.length, 0, "two members never call each other");
});

await test("a suspended, archived, blocked or removed person on either end rings nobody", async () => {
  for (const [who, change] of [
    [ASHA, (db) => (db.tables.profiles.find((p) => p.id === ASHA).suspended = true)],
    [ASHA, (db) => (db.tables.profiles.find((p) => p.id === ASHA).archived = true)],
    [ASHA, (db) => (db.tables.chat_members.find((m) => m.user_id === ASHA).blocked = true)],
    [ASHA, (db) => (db.tables.chat_members.find((m) => m.user_id === ASHA).removed_at = "2026-11-01T00:00:00Z")],
    [ADMIN, (db) => (db.tables.chat_members.find((m) => m.user_id === ASHA).blocked = true)],
    [ADMIN, (db) => (db.tables.profiles.find((p) => p.id === ASHA).suspended = true)],
  ]) {
    const db = world();
    const push = await freshServer();
    await give(push, ADMIN, "adminphone");
    await give(push, ASHA, "ashaphone");
    change(db);
    await push.notifyIncomingCall(ring(who === ASHA ? ADMIN : ASHA), ORIGIN);
    await push.notifyIncomingCall(ring(who), ORIGIN);
    assert.equal(pushes.length, 0);
  }
});

await test("a muted chat brings no message notification to whoever muted it, but its calls still ring", async () => {
  world();
  globalThis.__db.tables.chat_members.find((m) => m.user_id === ADMIN).muted = true;
  const push = await freshServer();
  await give(push, ADMIN, "adminphone");
  await give(push, ASHA, "ashaphone");
  await push.notifyNewMessage(CHAT, ASHA, ORIGIN);
  assert.deepEqual(pushes, []);
  await push.notifyNewMessage(CHAT, ADMIN, ORIGIN);
  assert.deepEqual(pushes.map((p) => p.to), ["ashaphone"]);
  pushes.length = 0;
  await push.notifyIncomingCall(ring(ASHA), ORIGIN);
  await push.notifyMissedCall({ chatId: CHAT, callerId: ASHA, calleeId: ADMIN, kind: "voice" }, ORIGIN);
  assert.deepEqual(pushes.map((p) => p.to), ["adminphone", "adminphone"]);
});

await test("an incoming call never throws, whatever the database or the push service does", async () => {
  const db = world();
  const push = await freshServer();
  await give(push, ASHA, "ashaphone");
  globalThis.__service = () => "down";
  await push.notifyIncomingCall(ring(ADMIN), ORIGIN);
  db.down = true;
  await push.notifyIncomingCall(ring(ADMIN), ORIGIN);
  world({ migrated: false });
  await (await freshServer()).notifyIncomingCall(ring(ADMIN), ORIGIN);
});


await test("a test notification goes to this phone at once, even while the app is open on it", async () => {
  world();
  const push = await freshServer();
  const mine = await give(push, ASHA, "asha-phone", 1);
  assert.equal(await push.sendTestPush(ASHA, mine.endpoint, ORIGIN), "sent");
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].to, "asha-phone");
  assert.equal(pushes[0].notice.title, "Test notification");
  assert.equal(pushes[0].notice.tag, "test");
});

await test("a test is only sent to the caller's own registered phone", async () => {
  world();
  const push = await freshServer();
  const ravis = await give(push, RAVI, "ravi-phone");
  assert.equal(await push.sendTestPush(ASHA, ravis.endpoint, ORIGIN), "not-registered");
  assert.equal(await push.sendTestPush(ASHA, "https://fcm.googleapis.com/fcm/send/nobody", ORIGIN), "not-registered");
  assert.equal(pushes.length, 0);
});

await test("a phone the push service no longer knows is forgotten and reported", async () => {
  world();
  const push = await freshServer();
  const mine = await give(push, ASHA, "asha-old");
  globalThis.__service = () => 410;
  assert.equal(await push.sendTestPush(ASHA, mine.endpoint, ORIGIN), "not-registered");
  assert.equal(devices().length, 0);
});

await test("a push service that refuses the test is reported as failed, and nothing is thrown", async () => {
  world();
  const push = await freshServer();
  const mine = await give(push, ASHA, "asha-refused");
  globalThis.__service = () => 403;
  assert.equal(await quiet(() => push.sendTestPush(ASHA, mine.endpoint, ORIGIN)), "failed");
  assert.equal(devices().length, 1, "a refusal is not a reason to forget the phone");
});

await test("before the migration has been run, a test says so", async () => {
  world({ migrated: false });
  const push = await freshServer();
  assert.equal(await push.sendTestPush(ASHA, "https://fcm.googleapis.com/fcm/send/a1", ORIGIN), "not-set-up");
  assert.equal(pushes.length, 0);
});
