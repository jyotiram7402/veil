import assert from "node:assert/strict";
import { test } from "node:test";
import { takeToken } from "../src/lib/token-bucket.ts";

test("a full bucket lets the limit through, then refuses", () => {
  const buckets = new Map();
  const results = Array.from({ length: 4 }, () => takeToken(buckets, "k", 3, 60_000, 0));
  assert.deepEqual(results, [true, true, true, false]);
});

test("tokens come back evenly over the window", () => {
  const buckets = new Map();
  for (let i = 0; i < 3; i++) takeToken(buckets, "k", 3, 60_000, 0);
  assert.equal(takeToken(buckets, "k", 3, 60_000, 10_000), false, "half a token after 10 s");
  assert.equal(takeToken(buckets, "k", 3, 60_000, 20_000), true, "one token after 20 s");
  assert.equal(takeToken(buckets, "k", 3, 60_000, 21_000), false);
});

test("a refused attempt costs nothing, so waiting is enough", () => {
  const buckets = new Map();
  for (let i = 0; i < 3; i++) takeToken(buckets, "k", 3, 60_000, 0);
  for (let t = 1_000; t < 20_000; t += 1_000) assert.equal(takeToken(buckets, "k", 3, 60_000, t), false);
  assert.equal(takeToken(buckets, "k", 3, 60_000, 20_000), true);
});

test("a long rest never fills the bucket past its limit", () => {
  const buckets = new Map();
  takeToken(buckets, "k", 2, 60_000, 0);
  const later = 10 * 60 * 60_000;
  assert.deepEqual(
    [1, 2, 3].map(() => takeToken(buckets, "k", 2, 60_000, later)),
    [true, true, false],
  );
});

test("each key has its own bucket", () => {
  const buckets = new Map();
  assert.equal(takeToken(buckets, "a", 1, 60_000, 0), true);
  assert.equal(takeToken(buckets, "a", 1, 60_000, 0), false);
  assert.equal(takeToken(buckets, "b", 1, 60_000, 0), true);
});
