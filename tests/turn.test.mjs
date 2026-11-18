import assert from "node:assert/strict";
import { test } from "node:test";

const { createTurnCredentials, pickIceServers } = await import(new URL("../src/lib/turn.ts", import.meta.url).href);

const CLOUDFLARE = {
  iceServers: [
    { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] },
    {
      urls: [
        "turn:turn.cloudflare.com:3478?transport=udp",
        "turn:turn.cloudflare.com:53?transport=udp",
        "turn:turn.cloudflare.com:443?transport=udp",
        "turn:turn.cloudflare.com:3478?transport=tcp",
        "turn:turn.cloudflare.com:80?transport=tcp",
        "turns:turn.cloudflare.com:5349?transport=tcp",
        "turns:turn.cloudflare.com:443?transport=tcp",
      ],
      username: "made-up-user",
      credential: "made-up-credential",
    },
  ],
};

let calls;
function cloudflare(answer) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (answer === "down") throw new Error("no route");
    if (typeof answer === "number") return new Response("{}", { status: answer });
    if (answer === "garbage") return new Response("<html>", { status: 200 });
    return new Response(JSON.stringify(answer), { status: 201 });
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

await test("without the two values nothing is asked of Cloudflare", async () => {
  globalThis.__env = {};
  cloudflare(CLOUDFLARE);
  assert.deepEqual(await createTurnCredentials(), { ok: false, reason: "not_configured" });
  globalThis.__env = { CLOUDFLARE_TURN_KEY_ID: "abc", CLOUDFLARE_TURN_API_TOKEN: "   " };
  assert.deepEqual(await createTurnCredentials(), { ok: false, reason: "not_configured" });
  assert.equal(calls.length, 0);
});

await test("asks Cloudflare the documented way and keeps one address per way in", async () => {
  globalThis.__env = { CLOUDFLARE_TURN_KEY_ID: " key-id-123 \n", CLOUDFLARE_TURN_API_TOKEN: " token-456 " };
  cloudflare(CLOUDFLARE);
  const out = await createTurnCredentials();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://rtc.live.cloudflare.com/v1/turn/keys/key-id-123/credentials/generate-ice-servers");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer token-456");
  assert.deepEqual(JSON.parse(calls[0].init.body), { ttl: 43200 });
  assert.deepEqual(out, {
    ok: true,
    iceServers: [
      { urls: ["stun:stun.cloudflare.com:3478"] },
      {
        urls: [
          "turn:turn.cloudflare.com:3478?transport=udp",
          "turn:turn.cloudflare.com:80?transport=tcp",
          "turns:turn.cloudflare.com:443?transport=tcp",
        ],
        username: "made-up-user",
        credential: "made-up-credential",
      },
    ],
  });
});

await test("a wrong key is 'rejected'; an outage or a busy Cloudflare is 'unreachable'", async () => {
  globalThis.__env = { CLOUDFLARE_TURN_KEY_ID: "k", CLOUDFLARE_TURN_API_TOKEN: "t" };
  for (const [answer, reason] of [[401, "rejected"], [403, "rejected"], [404, "rejected"], [429, "unreachable"], [500, "unreachable"], ["down", "unreachable"], ["garbage", "unreachable"]]) {
    cloudflare(answer);
    assert.deepEqual(await quiet(createTurnCredentials), { ok: false, reason }, String(answer));
  }
});

await test("an answer without a relay server is not handed out as one", async () => {
  globalThis.__env = { CLOUDFLARE_TURN_KEY_ID: "k", CLOUDFLARE_TURN_API_TOKEN: "t" };
  cloudflare({ iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }] });
  assert.deepEqual(await quiet(createTurnCredentials), { ok: false, reason: "unreachable" });
  cloudflare({});
  assert.deepEqual(await quiet(createTurnCredentials), { ok: false, reason: "unreachable" });
});

await test("other shapes of answer: one object, unknown ports, missing credentials", async () => {
  assert.deepEqual(pickIceServers({ urls: "turn:relay.example:3478?transport=udp", username: "u", credential: "c" }), [
    { urls: ["turn:relay.example:3478?transport=udp"], username: "u", credential: "c" },
  ]);
  assert.deepEqual(
    pickIceServers([{ urls: ["turn:x:53?transport=udp", "turn:x:1?transport=udp", "turn:x:2?transport=udp", "turn:x:3?transport=udp", "turn:x:4?transport=udp"], username: "u", credential: "c" }]),
    [{ urls: ["turn:x:1?transport=udp", "turn:x:2?transport=udp", "turn:x:3?transport=udp"], username: "u", credential: "c" }],
  );
  assert.deepEqual(pickIceServers([{ urls: ["turn:x:3478?transport=udp"] }]), []);
  assert.deepEqual(pickIceServers(null), []);
  assert.deepEqual(pickIceServers([null, "x", 7]), []);
});

