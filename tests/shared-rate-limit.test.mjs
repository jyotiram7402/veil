import assert from "node:assert/strict";
import { test } from "node:test";
import { takeToken } from "../src/lib/token-bucket.ts";

const moduleUrl = new URL("../src/lib/shared-rate-limit.ts", import.meta.url).href;
let copies = 0;
async function freshCopy() {
  copies += 1;
  return import(`${moduleUrl}?copy=${copies}`);
}

function sharedDatabase() {
  const rows = new Map();
  const sent = [];
  globalThis.__env = {};
  globalThis.__db = {
    calls: [],
    rpc: {
      take_rate_token(args) {
        sent.push(args);
        return { data: takeToken(rows, args.p_key, args.p_limit, args.p_per_ms, Date.now()), error: null };
      },
    },
  };
  return { rows, sent };
}

function captureErrors() {
  const lines = [];
  const original = console.error;
  console.error = (...args) => lines.push(args.join(" "));
  return { lines, restore: () => (console.error = original) };
}

test("two server instances take from one bucket", async () => {
  sharedDatabase();
  const a = await freshCopy();
  const b = await freshCopy();
  const results = [
    await a.sharedRateLimit("login:203.0.113.9", 3, 60_000),
    await b.sharedRateLimit("login:203.0.113.9", 3, 60_000),
    await a.sharedRateLimit("login:203.0.113.9", 3, 60_000),
    await b.sharedRateLimit("login:203.0.113.9", 3, 60_000),
  ];
  assert.deepEqual(results, [true, true, true, false]);
});

test("the database never sees the address, the username or the token", async () => {
  const { sent } = sharedDatabase();
  const { sharedRateLimit } = await freshCopy();
  await sharedRateLimit("gate:Q2w9Zp0LmN4secret:203.0.113.9", 8, 60_000);
  await sharedRateLimit("gate:Q2w9Zp0LmN4secret:203.0.113.9", 8, 60_000);
  await sharedRateLimit("gate:other:203.0.113.9", 8, 60_000);
  const [first, second, third] = sent;
  assert.match(first.p_key, /^[0-9a-f]{64}$/);
  assert.ok(!first.p_key.includes("Q2w9") && !first.p_key.includes("203.0.113.9"));
  assert.equal(first.p_key, second.p_key, "the same bucket gets the same key");
  assert.notEqual(first.p_key, third.p_key, "another bucket gets another key");
  assert.equal(first.p_limit, 8);
  assert.equal(first.p_per_ms, 60_000);
});

test("before v15.sql has run, each instance counts on its own and says so once", async () => {
  globalThis.__env = {};
  globalThis.__db = { calls: [] };
  const log = captureErrors();
  try {
    const { sharedRateLimit } = await freshCopy();
    const results = [];
    for (let i = 0; i < 3; i++) results.push(await sharedRateLimit("signup:198.51.100.4", 2, 60_000));
    assert.deepEqual(results, [true, true, false]);
    assert.equal(log.lines.length, 1);
    assert.match(log.lines[0], /^\[rate-limit\] shared limit unavailable.*PGRST202/);
    assert.ok(!log.lines[0].includes("198.51.100.4"));
  } finally {
    log.restore();
  }
});

test("a database that throws or answers nonsense still leaves a limit", async () => {
  for (const rpc of [
    () => {
      throw new TypeError("fetch failed");
    },
    () => ({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }),
    () => ({ data: "yes", error: null }),
  ]) {
    globalThis.__env = {};
    globalThis.__db = { calls: [], rpc: { take_rate_token: rpc } };
    const log = captureErrors();
    try {
      const { sharedRateLimit } = await freshCopy();
      const results = [];
      for (let i = 0; i < 2; i++) results.push(await sharedRateLimit("lock:user-1:192.0.2.1", 1, 60_000));
      assert.deepEqual(results, [true, false]);
      assert.equal(log.lines.length, 1);
    } finally {
      log.restore();
    }
  }
});

test("a refusal from the database is a refusal, not a reason to count locally", async () => {
  globalThis.__env = {};
  globalThis.__db = { calls: [], rpc: { take_rate_token: () => ({ data: false, error: null }) } };
  const { sharedRateLimit } = await freshCopy();
  assert.equal(await sharedRateLimit("login:203.0.113.9", 10, 60_000), false);
});
