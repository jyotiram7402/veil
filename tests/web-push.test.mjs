import assert from "node:assert/strict";
import { test } from "node:test";
import { createDecipheriv, createECDH, createPublicKey, hkdfSync, verify } from "node:crypto";

const push = await import(new URL("../src/lib/web-push.ts", import.meta.url).href);

const b64 = (s) => Buffer.from(s, "base64url");
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  authSecret: "BTBZMqHH6r4Tts7J_aSIgg",
  message:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml" +
    "mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT" +
    "pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

function decryptAsBrowser(body, uaPrivate, uaPublic, authSecret) {
  const salt = body.subarray(0, 16);
  const recordSize = body.readUInt32BE(16);
  const idLength = body.readUInt8(20);
  const asPublic = body.subarray(21, 21 + idLength);
  const sealed = body.subarray(21 + idLength);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(uaPrivate);
  const shared = ecdh.computeSecret(asPublic);
  const info = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, authSecret, info, 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(sealed.subarray(sealed.length - 16));
  const padded = Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - 16)), decipher.final()]);
  let end = padded.length - 1;
  while (padded[end] === 0) end--;
  assert.equal(padded[end], 2, "the last record ends with the delimiter 2");
  return { text: padded.subarray(0, end).toString(), recordSize, idLength, total: body.length };
}

function device() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = Buffer.from("0123456789abcdef");
  return {
    privateKey: ecdh.getPrivateKey(),
    publicKey: ecdh.getPublicKey(),
    auth,
    target: (endpoint) => ({
      endpoint,
      p256dh: ecdh.getPublicKey().toString("base64url"),
      auth: auth.toString("base64url"),
    }),
  };
}

let calls;
function pushService(answer) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (answer === "down") throw new Error("no route");
    return new Response("", { status: answer });
  };
}
const quiet = async (fn) => {
  const keep = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = keep;
  }
};

await test("the standard's worked example comes out byte for byte", async () => {
  const out = push.encryptWith(
    Buffer.from(RFC.plaintext),
    { p256dh: RFC.uaPublic, auth: RFC.authSecret },
    b64(RFC.salt),
    b64(RFC.asPrivate),
  );
  assert.equal(out.toString("base64url"), RFC.message);
  assert.equal(out.length, 144);
});

await test("the example decrypts the way a browser would do it", async () => {
  const seen = decryptAsBrowser(b64(RFC.message), b64(RFC.uaPrivate), b64(RFC.uaPublic), b64(RFC.authSecret));
  assert.deepEqual(seen, { text: RFC.plaintext, recordSize: 4096, idLength: 65, total: 144 });
});

await test("a fresh message: new salt and key every time, and the device can read it", async () => {
  const phone = device();
  const text = JSON.stringify({ title: "Asha", body: "New message", tag: "chat-1", url: "/chats/1" });
  const a = push.encryptPayload(Buffer.from(text), phone.target("https://fcm.googleapis.com/fcm/send/x"));
  const b = push.encryptPayload(Buffer.from(text), phone.target("https://fcm.googleapis.com/fcm/send/x"));
  assert.notEqual(a.toString("hex"), b.toString("hex"));
  assert.notEqual(a.subarray(0, 16).toString("hex"), b.subarray(0, 16).toString("hex"));
  assert.notEqual(a.subarray(21, 86).toString("hex"), b.subarray(21, 86).toString("hex"));
  assert.equal(decryptAsBrowser(a, phone.privateKey, phone.publicKey, phone.auth).text, text);
  assert.equal(decryptAsBrowser(b, phone.privateKey, phone.publicKey, phone.auth).text, text);
  assert.equal(a.length, 86 + text.length + 1 + 16);
});

await test("a subscription with broken keys, or a message that is too long, is refused", async () => {
  const phone = device();
  const good = phone.target("https://fcm.googleapis.com/fcm/send/x");
  assert.throws(() => push.encryptPayload(Buffer.from("x"), { ...good, p256dh: "AAAA" }));
  assert.throws(() => push.encryptPayload(Buffer.from("x"), { ...good, auth: "AAAA" }));
  const compressed = Buffer.from(phone.publicKey);
  compressed[0] = 2;
  assert.throws(() => push.encryptPayload(Buffer.from("x"), { ...good, p256dh: compressed.toString("base64url") }));
  const offCurve = Buffer.alloc(65, 1);
  offCurve[0] = 4;
  assert.throws(() => push.encryptPayload(Buffer.from("x"), { ...good, p256dh: offCurve.toString("base64url") }));
  assert.throws(() => push.encryptPayload(Buffer.alloc(4000), good));
  push.encryptPayload(Buffer.alloc(3993), good);
});

await test("the sender's key pair has the shape browsers expect", async () => {
  for (let i = 0; i < 20; i++) {
    const keys = push.generateVapidKeys();
    const pub = b64(keys.publicKey);
    assert.equal(pub.length, 65);
    assert.equal(pub[0], 4);
    assert.equal(b64(keys.privateKey).length, 32);
    assert.match(keys.publicKey, /^[A-Za-z0-9_-]{87}$/);
    assert.match(keys.privateKey, /^[A-Za-z0-9_-]{43}$/);
  }
});

await test("the sender's proof (RFC 8292) verifies with the public key and names the right service", async () => {
  const keys = push.generateVapidKeys();
  const now = Date.UTC(2026, 10, 17, 6, 0, 0);
  const header = push.vapidAuthorization(
    "https://web.push.apple.com/QOabc123?x=1",
    keys,
    "https://blackfoxx.example",
    now,
  );
  const m = /^vapid t=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+), k=([A-Za-z0-9_-]+)$/.exec(header);
  assert.ok(m, header);
  assert.equal(m[4], keys.publicKey);
  assert.deepEqual(JSON.parse(b64(m[1]).toString()), { typ: "JWT", alg: "ES256" });
  assert.deepEqual(JSON.parse(b64(m[2]).toString()), {
    aud: "https://web.push.apple.com",
    exp: now / 1000 + 12 * 60 * 60,
    sub: "https://blackfoxx.example",
  });
  const signature = b64(m[3]);
  assert.equal(signature.length, 64);
  const point = b64(keys.publicKey);
  const publicKey = createPublicKey({
    format: "jwk",
    key: {
      kty: "EC",
      crv: "P-256",
      x: point.subarray(1, 33).toString("base64url"),
      y: point.subarray(33, 65).toString("base64url"),
    },
  });
  const signed = Buffer.from(`${m[1]}.${m[2]}`);
  assert.equal(verify("sha256", signed, { key: publicKey, dsaEncoding: "ieee-p1363" }, signature), true);
  const other = push.generateVapidKeys();
  const otherPoint = b64(other.publicKey);
  const otherKey = createPublicKey({
    format: "jwk",
    key: {
      kty: "EC",
      crv: "P-256",
      x: otherPoint.subarray(1, 33).toString("base64url"),
      y: otherPoint.subarray(33, 65).toString("base64url"),
    },
  });
  assert.equal(verify("sha256", signed, { key: otherKey, dsaEncoding: "ieee-p1363" }, signature), false);
});

await test("only real push services are accepted as an address", async () => {
  for (const ok of [
    "https://fcm.googleapis.com/fcm/send/abc:def",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
    "https://web.push.apple.com/QGabc",
    "https://wns2-pn1p.notify.windows.com/w/?token=abc",
    "https://db5p.notify.windows.com/w/?token=abc",
  ]) {
    assert.equal(push.isPushEndpoint(ok), true, ok);
  }
  for (const bad of [
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com.evil.example/fcm/send/abc",
    "https://evilfcm.googleapis.com/x",
    "https://evil.example/?x=fcm.googleapis.com",
    "https://notify.windows.com.evil.example/",
    "https://xnotify.windows.com/",
    "https://localhost/push",
    "https://127.0.0.1/push",
    "https://169.254.169.254/latest/meta-data",
    "https://user@fcm.googleapis.com.evil.example/",
    "javascript:alert(1)",
    "not a url",
    "",
    null,
    undefined,
    42,
    {},
    "https://fcm.googleapis.com/" + "a".repeat(2000),
  ]) {
    assert.equal(push.isPushEndpoint(bad), false, String(bad));
  }
});

await test("a push is sent the documented way and the device can read it", async () => {
  const phone = device();
  const keys = push.generateVapidKeys();
  pushService(201);
  const target = phone.target("https://fcm.googleapis.com/fcm/send/abc");
  const payload = { title: "Asha", body: "New message", tag: "chat-1", url: "/chats/1" };
  const out = await push.sendPush(target, payload, keys, {
    subject: "https://blackfoxx.example",
    ttlSeconds: 86400,
    topic: push.pushTopic("chat-1"),
  });
  assert.equal(out, "sent");
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(url, target.endpoint);
  assert.equal(init.method, "POST");
  assert.equal(init.headers["Content-Encoding"], "aes128gcm");
  assert.equal(init.headers.TTL, "86400");
  assert.equal(init.headers.Urgency, "high");
  assert.match(init.headers.Topic, /^[A-Za-z0-9_-]{32}$/);
  assert.match(init.headers.Authorization, /^vapid t=[^,]+, k=/);
  assert.ok(init.headers.Authorization.endsWith(keys.publicKey));
  assert.ok(init.signal instanceof AbortSignal);
  const seen = decryptAsBrowser(Buffer.from(init.body), phone.privateKey, phone.publicKey, phone.auth);
  assert.deepEqual(JSON.parse(seen.text), payload);

  pushService(201);
  await push.sendPush(target, payload, keys, { subject: "https://blackfoxx.example", ttlSeconds: 60 });
  assert.equal("Topic" in calls[0].init.headers, false);
});

await test("what the push service answers decides what happens to the device", async () => {
  const phone = device();
  const keys = push.generateVapidKeys();
  const target = phone.target("https://web.push.apple.com/abc");
  const options = { subject: "https://blackfoxx.example", ttlSeconds: 60 };
  for (const [answer, result] of [
    [200, "sent"], [201, "sent"], [202, "sent"],
    [404, "gone"], [410, "gone"],
    [400, "failed"], [401, "failed"], [403, "failed"], [413, "failed"], [429, "failed"], [500, "failed"], [503, "failed"],
    ["down", "failed"],
  ]) {
    pushService(answer);
    assert.equal(await quiet(() => push.sendPush(target, { title: "x" }, keys, options)), result, String(answer));
    assert.equal(calls.length, 1);
  }
});

await test("nothing is ever sent to an address that is not a push service, or to broken keys", async () => {
  const phone = device();
  const keys = push.generateVapidKeys();
  const options = { subject: "https://blackfoxx.example", ttlSeconds: 60 };
  pushService(201);
  assert.equal(await push.sendPush(phone.target("https://169.254.169.254/latest"), { title: "x" }, keys, options), "gone");
  assert.equal(await push.sendPush(phone.target("https://evil.example/collect"), { title: "x" }, keys, options), "gone");
  assert.equal(
    await push.sendPush({ ...phone.target("https://fcm.googleapis.com/fcm/send/a"), p256dh: "AAAA" }, { title: "x" }, keys, options),
    "gone",
  );
  assert.equal(calls.length, 0);
});

await test("a topic is short, stable and says nothing about the chat", async () => {
  const a = push.pushTopic("chat-3f0c0b0e-0000-4000-8000-000000000001");
  assert.match(a, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(a, push.pushTopic("chat-3f0c0b0e-0000-4000-8000-000000000001"));
  assert.notEqual(a, push.pushTopic("chat-3f0c0b0e-0000-4000-8000-000000000002"));
  assert.equal(a.includes("3f0c0b0e"), false);
});

