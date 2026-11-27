import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DIRECT_LINK_HOURS,
  INVITE_HOURS,
  KEEP_OPEN,
  directLinkEnd,
  endsLine,
  inviteEnd,
  linkState,
  openUntil,
} from "../src/lib/invite-window.ts";

const NOW = Date.UTC(2026, 10, 27, 9, 0, 0);
const HOUR = 3_600_000;
const at = (ms) => new Date(NOW + ms).toISOString();

test("a new invite link and a direct link are open for 48 hours", () => {
  assert.equal(INVITE_HOURS, 48);
  assert.equal(DIRECT_LINK_HOURS, 48);
  assert.equal(inviteEnd(NOW), at(48 * HOUR));
  assert.equal(directLinkEnd(NOW), at(48 * HOUR));
});

test("keeping a link open counts from now, and Always means it never runs out", () => {
  assert.deepEqual([...KEEP_OPEN], ["48h", "7d", "30d", "always"]);
  assert.equal(openUntil("48h", NOW), at(48 * HOUR));
  assert.equal(openUntil("7d", NOW), at(7 * 24 * HOUR));
  assert.equal(openUntil("30d", NOW), at(30 * 24 * HOUR));
  assert.equal(openUntil("always", NOW), null);
});

test("a link is open, off, ended or gone", () => {
  assert.equal(linkState(null, NOW), "none");
  assert.equal(linkState(undefined, NOW), "none");
  assert.equal(linkState({ enabled: true, revoked_at: at(-HOUR) }, NOW), "none");
  assert.equal(linkState({ enabled: false, expires_at: at(HOUR) }, NOW), "off");
  assert.equal(linkState({ enabled: false, expires_at: at(-HOUR) }, NOW), "off");
  assert.equal(linkState({ enabled: true, expires_at: at(-1) }, NOW), "ended");
  assert.equal(linkState({ enabled: true, expires_at: at(0) }, NOW), "ended");
  assert.equal(linkState({ enabled: true, expires_at: at(HOUR) }, NOW), "open");
  assert.equal(linkState({ enabled: true, expires_at: null }, NOW), "open");
  assert.equal(linkState({ enabled: true }, NOW), "open", "a link made before v16 has no end");
});

test("how long a link has left reads like a person would say it", () => {
  assert.equal(endsLine(null, NOW), "Never runs out");
  assert.equal(endsLine(undefined, NOW), "Never runs out");
  assert.equal(endsLine(at(48 * HOUR), NOW), "Runs out in 2 days");
  assert.equal(endsLine(at(48 * HOUR - 5_000), NOW), "Runs out in 2 days");
  assert.equal(endsLine(at(47 * HOUR), NOW), "Runs out in 47 hours");
  assert.equal(endsLine(at(5 * HOUR), NOW), "Runs out in 5 hours");
  assert.equal(endsLine(at(HOUR), NOW), "Runs out in 1 hour");
  assert.equal(endsLine(at(30 * 60_000), NOW), "Runs out in 30 minutes");
  assert.equal(endsLine(at(20_000), NOW), "Runs out in 1 minute");
  assert.equal(endsLine(at(7 * 24 * HOUR), NOW), "Runs out in 7 days");
  assert.equal(endsLine(at(-3 * HOUR), NOW), "Ran out 3 hours ago");
  assert.equal(endsLine(at(-3 * 24 * HOUR), NOW), "Ran out 3 days ago");
});
