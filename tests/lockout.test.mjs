import assert from "node:assert/strict";
import { test } from "node:test";

const { lockOut, letBackIn } = await import(new URL("../src/lib/lockout.ts", import.meta.url).href);

const RAVI = "ravi-id";
const ASHA = "asha-id";

function fresh({ migrated = true } = {}) {
  globalThis.__env = {};
  globalThis.__db = {
    calls: [],
    clock: () => new Date().toISOString(),
    tables: migrated
      ? {
          push_subscriptions: [
            { id: "d1", user_id: RAVI, endpoint: "https://fcm.googleapis.com/fcm/send/ravi-phone" },
            { id: "d2", user_id: RAVI, endpoint: "https://fcm.googleapis.com/fcm/send/ravi-laptop" },
            { id: "d3", user_id: ASHA, endpoint: "https://fcm.googleapis.com/fcm/send/asha-phone" },
          ],
        }
      : {},
  };
  return globalThis.__db;
}

test("locking someone out bans them, replaces their password and forgets all their devices", async () => {
  const db = fresh();
  await lockOut(RAVI);
  assert.equal(db.authUpdates.length, 1);
  const { id, attrs } = db.authUpdates[0];
  assert.equal(id, RAVI);
  assert.equal(attrs.ban_duration, "876000h");
  assert.equal(typeof attrs.password, "string");
  assert.ok(attrs.password.length >= 30);
  assert.deepEqual(
    db.tables.push_subscriptions.map((d) => d.id),
    ["d3"],
  );
});

test("every lock-out uses a new password nobody knows", async () => {
  const db = fresh();
  await lockOut(RAVI);
  await lockOut(RAVI);
  const [a, b] = db.authUpdates.map((u) => u.attrs.password);
  assert.notEqual(a, b);
});

test("locking out never throws, whatever is down", async () => {
  let db = fresh();
  db.authDown = true;
  db.down = true;
  await lockOut(RAVI);
  db = fresh({ migrated: false });
  await lockOut(RAVI);
  assert.equal(db.authUpdates.length, 1);
});

test("letting someone back in lifts the ban and leaves the password alone", async () => {
  const db = fresh();
  assert.equal(await letBackIn(RAVI), true);
  assert.deepEqual(db.authUpdates, [{ id: RAVI, attrs: { ban_duration: "none" } }]);
  assert.equal(db.tables.push_subscriptions.length, 3);
});

test("letting someone back in says so when it did not work", async () => {
  const db = fresh();
  db.authDown = true;
  assert.equal(await letBackIn(RAVI), false);
});
