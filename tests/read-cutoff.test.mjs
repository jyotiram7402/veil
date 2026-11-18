import assert from "node:assert/strict";
import { test } from "node:test";

const { readCutoff } = await import(new URL("../src/lib/read-cutoff.ts", import.meta.url).href);

const NOW = Date.parse("2026-11-15T12:00:00.000Z");

test("the message the time was taken from is inside the cutoff", () => {
  const created = "2026-11-15T10:20:30.123456+00:00";
  const cutoff = readCutoff(created, NOW);
  assert.equal(cutoff, "2026-11-15T10:20:30.123999Z");
  const micros = (iso) => {
    const m = /^(.*T\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d:\d\d)$/.exec(iso);
    const whole = Date.parse(m[1] + m[3]);
    return BigInt(whole) * 1000n + BigInt((m[2] ?? "").padEnd(6, "0") || "0");
  };
  assert.ok(micros(created) <= micros(cutoff), "created <= cutoff");
  const old = new Date(Date.parse(created)).toISOString();
  assert.ok(micros(created) > micros(old), "the old cutoff missed it");
});

test("a message one millisecond later is outside", () => {
  const cutoff = readCutoff("2026-11-15T10:20:30.123456+00:00", NOW);
  assert.ok(Date.parse("2026-11-15T10:20:30.124000+00:00") > Date.parse(cutoff));
});

test("a time without a fraction, and one written with Z", () => {
  assert.equal(readCutoff("2026-11-15T10:20:30+00:00", NOW), "2026-11-15T10:20:30.000999Z");
  assert.equal(readCutoff("2026-11-15T10:20:30.5Z", NOW), "2026-11-15T10:20:30.500999Z");
});

test("another time zone is brought to UTC", () => {
  assert.equal(readCutoff("2026-11-15T15:50:30.123456+05:30", NOW), "2026-11-15T10:20:30.123999Z");
});

test("never later than now", () => {
  assert.equal(readCutoff("2030-01-01T00:00:00Z", NOW), "2026-11-15T12:00:00.000999Z");
});

test("not a time gives null", () => {
  assert.equal(readCutoff("yesterday-ish", NOW), null);
  assert.equal(readCutoff("", NOW), null);
});

