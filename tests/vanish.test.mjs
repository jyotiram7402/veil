import assert from "node:assert/strict";
import { test } from "node:test";

const { chatIsDisappearing, deleteReadMessages } = await import(new URL("../src/lib/vanish.ts", import.meta.url).href);

const A = "11111111-1111-4111-8111-111111111111";
const M = "22222222-2222-4222-8222-222222222222";
const C1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const C2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const link = (path) => `https://test.supabase.co/storage/v1/object/sign/attachments/${path}?token=t`;
const BASE = Date.parse("2026-11-15T10:00:00.000Z");
const at = (sec, microTail = "456") =>
  new Date(BASE + sec * 1000 + 123).toISOString().replace("Z", microTail + "+00:00");

let fetches;
function fresh({ messages = [], files = [] } = {}) {
  fetches = [];
  globalThis.__db = {
    calls: [],
    files: new Set(files),
    tables: {
      messages,
      chats: [
        { id: C1, type: "direct", members: [{ user: { id: A, is_admin: true } }, { user: { id: M, is_admin: false } }] },
        { id: C2, type: "group", members: [{ user: { id: A, is_admin: true } }, { user: { id: M, is_admin: false } }] },
        { id: "two-admins", type: "direct", members: [{ user: { id: A, is_admin: true } }, { user: { id: "x", is_admin: true } }] },
      ],
      app_settings: [],
      profiles: [{ id: M, settings: {} }],
    },
  };
  globalThis.fetch = async (url, init) => {
    fetches.push({ url: String(url), init });
    if (globalThis.__db.realtimeDown) throw new Error("no network");
    return new Response("{}", { status: 202 });
  };
  return globalThis.__db;
}
const msg = (id, chat, sender, sec, extra = {}) => ({
  id, chat_id: chat, sender_id: sender, created_at: at(sec), attachment_url: null, ...extra,
});
const ids = (db) => db.tables.messages.map((m) => m.id).join(" ");

await test("deletes what was sent to the reader up to the time read, with its files, and nothing else", async () => {
  const db = fresh({
    messages: [
      msg("m1", C1, M, 1),
      msg("m2", C1, A, 2),
      msg("m3", C1, M, 3, { attachment_url: link(`${C1}/u3-photo.jpg`) }),
      msg("m4", C1, null, 4),
      msg("m5", C1, A, 5, { attachment_url: link(`${C1}/u5-mine.pdf`) }),
      msg("m6", C1, M, 6),
      msg("m7", C1, M, 7),
      msg("o1", C2, M, 1, { attachment_url: link(`${C2}/other.pdf`) }),
    ],
    files: [`${C1}/u3-photo.jpg`, `${C1}/u5-mine.pdf`, `${C2}/other.pdf`],
  });
  const out = await deleteReadMessages(C1, A, at(6));
  assert.deepEqual(out, { deleted: 4, more: false });
  assert.equal(ids(db), "m2 m5 m7 o1");
  assert.deepEqual([...db.files].sort(), [`${C1}/u5-mine.pdf`, `${C2}/other.pdf`]);
  assert.equal(fetches.length, 1);
  assert.equal(fetches[0].url, "https://test.supabase.co/realtime/v1/api/broadcast");
  assert.equal(fetches[0].init.method, "POST");
  assert.equal(fetches[0].init.headers.apikey, "test-service-key");
  const sent = JSON.parse(fetches[0].init.body);
  assert.deepEqual(sent, {
    messages: [{ topic: `chat:${C1}`, event: "vanished", payload: { reader: A, upTo: "2026-11-15T10:00:06.123999Z" } }],
  });
});

await test("the newest message (microseconds past the millisecond) goes too; one a millisecond later stays", async () => {
  const db = fresh({
    messages: [
      msg("read", C1, A, 1),
      { ...msg("later", C1, A, 1), created_at: new Date(BASE + 1000 + 124).toISOString().replace("Z", "000+00:00") },
    ],
  });
  const out = await deleteReadMessages(C1, M, at(1));
  assert.equal(out.deleted, 1);
  assert.equal(ids(db), "later");
});

await test("a message that has not been read stays", async () => {
  const db = fresh({ messages: [msg("m2", C1, A, 2), msg("m5", C1, A, 5), msg("mine", C1, M, 3)] });
  const out = await deleteReadMessages(C1, M, at(2));
  assert.equal(out.deleted, 1);
  assert.equal(ids(db), "m5 mine");
});

await test("a link doctored to point at another chat's file never deletes that file", async () => {
  const db = fresh({
    messages: [msg("evil", C1, M, 1, { attachment_url: link(`${C2}/other.pdf`) })],
    files: [`${C2}/other.pdf`],
  });
  const out = await deleteReadMessages(C1, A, at(1));
  assert.equal(out.deleted, 1);
  assert.deepEqual([...db.files], [`${C2}/other.pdf`]);
  assert.ok(!db.calls.some((c) => c.startsWith("storage")), "storage was not even asked");
});

await test("a time in the future counts as now", async () => {
  const soon = new Date(Date.now() + 3_600_000).toISOString().replace("Z", "000+00:00");
  const db = fresh({ messages: [msg("old", C1, M, 1), { ...msg("future", C1, M, 1), created_at: soon }] });
  const out = await deleteReadMessages(C1, A, "2099-01-01T00:00:00Z");
  assert.equal(out.deleted, 1);
  assert.equal(ids(db), "future");
});

await test("storage down: messages with a file are kept for the next leave, the rest goes", async () => {
  const db = fresh({
    messages: [msg("plain", C1, M, 1), msg("photo", C1, M, 2, { attachment_url: link(`${C1}/p.jpg`) })],
    files: [`${C1}/p.jpg`],
  });
  db.storageDown = true;
  const quiet = console.error;
  console.error = () => {};
  const out = await deleteReadMessages(C1, A, at(2));
  console.error = quiet;
  assert.deepEqual(out, { deleted: 1, more: false });
  assert.equal(ids(db), "photo");
  assert.deepEqual([...db.files], [`${C1}/p.jpg`]);
  db.storageDown = false;
  const again = await deleteReadMessages(C1, A, at(2));
  assert.equal(again.deleted, 1);
  assert.equal(ids(db), "");
  assert.equal(db.files.size, 0);
});

await test("a long history goes in rounds of 300", async () => {
  const many = Array.from({ length: 650 }, (_, i) => msg("h" + i, C1, M, i));
  const db = fresh({ messages: [...many, msg("mine", C1, A, 700)] });
  const out = await deleteReadMessages(C1, A, at(649));
  assert.deepEqual(out, { deleted: 650, more: false });
  assert.equal(ids(db), "mine");
  assert.equal(db.calls.filter((c) => c.startsWith("messages: select")).length, 3);
  assert.equal(db.calls.filter((c) => c.startsWith("messages: delete")).length, 7);
  assert.equal(fetches.length, 1);
});

await test("more than 3000: the answer says there is more, and the next request finishes", async () => {
  const many = Array.from({ length: 3100 }, (_, i) => msg("h" + i, C1, M, i));
  const db = fresh({ messages: many });
  const first = await deleteReadMessages(C1, A, at(3099));
  assert.deepEqual(first, { deleted: 3000, more: true });
  const second = await deleteReadMessages(C1, A, at(3099));
  assert.deepEqual(second, { deleted: 100, more: false });
  assert.equal(db.tables.messages.length, 0);
});

await test("exactly one full round is not reported as more", async () => {
  const db = fresh({ messages: Array.from({ length: 300 }, (_, i) => msg("h" + i, C1, M, i)) });
  const out = await deleteReadMessages(C1, A, at(299));
  assert.deepEqual(out, { deleted: 300, more: false });
  assert.equal(db.tables.messages.length, 0);
});

await test("nothing to delete: no word to the screens", async () => {
  fresh({ messages: [msg("mine", C1, A, 1)] });
  const out = await deleteReadMessages(C1, A, at(5));
  assert.deepEqual(out, { deleted: 0, more: false });
  assert.equal(fetches.length, 0);
});

await test("the screens cannot be told: the messages are deleted all the same", async () => {
  const db = fresh({ messages: [msg("m1", C1, M, 1)] });
  db.realtimeDown = true;
  const out = await deleteReadMessages(C1, A, at(1));
  assert.equal(out.deleted, 1);
  assert.equal(ids(db), "");
});

await test("database errors are thrown (the route answers 500), never swallowed", async () => {
  let db = fresh({ messages: [msg("m1", C1, M, 1)] });
  db.failSelect = true;
  await assert.rejects(() => deleteReadMessages(C1, A, at(1)));
  db = fresh({ messages: [msg("m1", C1, M, 1)] });
  db.failDelete = true;
  await assert.rejects(() => deleteReadMessages(C1, A, at(1)));
  assert.equal(ids(db), "m1");
});

await test("not a time: nothing is asked of the database", async () => {
  const db = fresh({ messages: [msg("m1", C1, M, 1)] });
  assert.deepEqual(await deleteReadMessages(C1, A, "soon"), { deleted: 0, more: false });
  assert.equal(db.calls.length, 0);
});

await test("whether a chat is a disappearing one: the member's setting decides", async () => {
  let db = fresh();
  assert.equal(await chatIsDisappearing(C1), false, "off by default");

  db = fresh();
  db.tables.profiles = [{ id: M, settings: { disappearing_messages: true } }];
  assert.equal(await chatIsDisappearing(C1), true, "on for this person");

  db = fresh();
  db.tables.app_settings = [{ key: "disappearing_messages", value: true }];
  assert.equal(await chatIsDisappearing(C1), true, "on for everyone");

  db = fresh();
  db.tables.app_settings = [{ key: "disappearing_messages", value: true }];
  db.tables.profiles = [{ id: M, settings: { disappearing_messages: false } }];
  assert.equal(await chatIsDisappearing(C1), false, "on for everyone, off for this person");

  db = fresh();
  db.tables.app_settings = [{ key: "disappearing_messages", value: true }];
  assert.equal(await chatIsDisappearing(C2), false, "never in a group chat");
  assert.equal(await chatIsDisappearing("two-admins"), false, "no member in the chat");
  assert.equal(await chatIsDisappearing("no-such-chat"), false, "unknown chat");
});

