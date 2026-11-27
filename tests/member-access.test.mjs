import assert from "node:assert/strict";
import { test } from "node:test";

const access = await import("../src/lib/member-access.ts");
const { hashPassword } = await import("../src/lib/password.ts");

const JAY = "jay-id";
const ASHA = "asha-id";
const RAVI = "ravi-id";
const MIRA = "mira-id";
const OLD = "old-id";
const GUEST = "guest-id";

const HOUR = 3_600_000;
const soon = () => new Date(Date.now() + HOUR).toISOString();
const ago = () => new Date(Date.now() - HOUR).toISOString();
const hoursLeft = (iso) => (Date.parse(iso) - Date.now()) / HOUR;

const LAUGH = "Hi\u{1F602}";
const HEART = "Hi❤️";
const HI = await access.hashHashcode(LAUGH);

const person = (id, username, display_name, extra = {}) => ({
  id,
  username,
  display_name,
  avatar_url: null,
  is_admin: false,
  is_room_guest: false,
  suspended: false,
  archived: false,
  ...extra,
});

function link(userId, hash, extra = {}) {
  return {
    token: `invite-${userId}`,
    user_id: userId,
    enabled: true,
    created_at: "2026-11-20T09:00:00.000Z",
    revoked_at: null,
    last_used_at: null,
    use_count: 0,
    gate_password_hash: hash,
    expires_at: soon(),
    ...extra,
  };
}

function world({ invites = [], migrated = true, extraPeople = [] } = {}) {
  let tick = 0;
  globalThis.__db = {
    calls: [],
    clock: () => new Date(Date.UTC(2026, 10, 27, 9, 0, tick++)).toISOString(),
    tables: {
      profiles: [
        person(JAY, "jay", "Jay", { is_admin: true }),
        person(ASHA, "asha", "Asha Rao"),
        person(RAVI, "ravi", null),
        person(MIRA, "mira", "Mira", { suspended: true }),
        person(OLD, "old_friend", "Old Friend", { archived: true }),
        person(GUEST, "guest_1", "Asha Rao", { is_room_guest: true }),
        ...extraPeople,
      ],
      invite_tokens: invites,
      ...(migrated ? { direct_links: [], hashcode_requests: [] } : {}),
    },
  };
  return globalThis.__db;
}

const WRONG = { ok: false, reason: "wrong" };
const GONE = { ok: false, reason: "gone" };

test("names and hashcodes are tidied the same way when set and when typed", () => {
  assert.equal(access.normalizeName("  Asha\t  RAO "), "asha rao");
  assert.equal(access.cleanHashcode(` ${HEART} `), "Hi❤");
  assert.equal(access.cleanHashcode("Café"), "Café");
});

test("a member signs in with their username or their name, in any case and spacing", async () => {
  world({ invites: [link(ASHA, HI)] });
  for (const name of ["asha", "ASHA", "@asha", "Asha Rao", "  asha   RAO "]) {
    const check = await access.checkMemberLogin(name, LAUGH);
    assert.equal(check.ok, true, name);
    assert.equal(check.member.id, ASHA);
    assert.equal(check.invite.token, `invite-${ASHA}`);
  }
});

test("a wrong hashcode, an unknown name, the admin, a suspended and an archived member all get the same answer", async () => {
  world({ invites: [link(ASHA, HI), link(MIRA, HI), link(JAY, HI)] });
  assert.deepEqual(await access.checkMemberLogin("asha", "Hi"), WRONG);
  assert.deepEqual(await access.checkMemberLogin("nobody", LAUGH), WRONG);
  assert.deepEqual(await access.checkMemberLogin("jay", LAUGH), WRONG);
  assert.deepEqual(await access.checkMemberLogin("mira", LAUGH), WRONG);
  assert.deepEqual(await access.checkMemberLogin("old_friend", LAUGH), WRONG);
});

test("a name two members share is not enough, and a room guest with the same name never counts", async () => {
  world({
    invites: [link(ASHA, HI), link("ravi-2", HI)],
    extraPeople: [person("ravi-2", "ravi_k", "Ravi K"), person("ravi-3", "ravi_r", "Ravi K")],
  });
  assert.deepEqual(await access.checkMemberLogin("Ravi K", LAUGH), WRONG);
  assert.equal((await access.checkMemberLogin("ravi_k", LAUGH)).ok, true);
  assert.equal((await access.checkMemberLogin("Asha Rao", LAUGH)).ok, true);
});

test("a name with wildcards in it matches only itself", async () => {
  world({ invites: [link(ASHA, HI)] });
  assert.deepEqual(await access.checkMemberLogin("asha%", LAUGH), WRONG);
  assert.deepEqual(await access.checkMemberLogin("A_ha Rao", LAUGH), WRONG);
  assert.deepEqual(await access.checkMemberLogin("%", LAUGH), WRONG);
});

test("an emoji or accented hashcode matches however the keyboard typed it", async () => {
  world({
    invites: [
      link(ASHA, await access.hashHashcode(HEART)),
      link(RAVI, await access.hashHashcode("Café")),
    ],
  });
  assert.equal((await access.checkMemberLogin("asha", "Hi❤")).ok, true, "heart without its variation selector");
  assert.equal((await access.checkMemberLogin("asha", `${HEART} `)).ok, true, "a space the keyboard added");
  assert.equal((await access.checkMemberLogin("ravi", "Café")).ok, true, "é typed as e and an accent");
  assert.deepEqual(await access.checkMemberLogin("asha", "hi❤"), WRONG, "capitals still count");
});

test("a password set before hashcodes, with spaces at its ends, still works", async () => {
  world({ invites: [link(ASHA, await hashPassword(" old pass "))] });
  assert.equal((await access.checkMemberLogin("asha", " old pass ")).ok, true);
});

test("once the invite link has run out or is switched off, the right hashcode is not enough", async () => {
  world({ invites: [link(ASHA, HI, { expires_at: ago() }), link(RAVI, HI, { enabled: false })] });
  assert.deepEqual(await access.checkMemberLogin("asha", LAUGH), { ok: false, reason: "ended" });
  assert.deepEqual(await access.checkMemberLogin("ravi", LAUGH), { ok: false, reason: "off" });
  assert.deepEqual(await access.checkMemberLogin("asha", "nope"), WRONG, "a wrong guess learns nothing about the link");
});

test("a link made before v16 has no end, and a removed link lets nobody in", async () => {
  const before = link(ASHA, HI);
  delete before.expires_at;
  world({ invites: [before, link(RAVI, HI, { revoked_at: ago(), enabled: false })] });
  assert.equal((await access.checkMemberLogin("asha", LAUGH)).ok, true);
  assert.deepEqual(await access.checkMemberLogin("ravi", LAUGH), WRONG);
});

test("a sign-in is counted on the invite link", async () => {
  const db = world({ invites: [link(ASHA, HI, { use_count: 2 })] });
  const check = await access.checkMemberLogin("asha", LAUGH);
  await access.recordSignIn(check.invite);
  assert.equal(db.tables.invite_tokens[0].use_count, 3);
  assert.ok(db.tables.invite_tokens[0].last_used_at);
});

test("an invite link shows the welcome screen only while it is open and its member can sign in", async () => {
  world({
    invites: [
      link(ASHA, HI),
      link(RAVI, HI, { expires_at: ago() }),
      link("ravi-2", HI, { enabled: false }),
      link(MIRA, HI),
      link(JAY, HI),
      link(OLD, HI, { revoked_at: ago(), enabled: false }),
    ],
    extraPeople: [person("ravi-2", "ravi_k", "Ravi K")],
  });
  assert.equal(await access.inviteLinkState(`invite-${ASHA}`), "open");
  assert.equal(await access.inviteLinkState(`invite-${RAVI}`), "ended");
  assert.equal(await access.inviteLinkState("invite-ravi-2"), "off");
  assert.equal(await access.inviteLinkState(`invite-${MIRA}`), "none");
  assert.equal(await access.inviteLinkState(`invite-${JAY}`), "none");
  assert.equal(await access.inviteLinkState(`invite-${OLD}`), "none");
  assert.equal(await access.inviteLinkState("no-such-token"), "none");
});

test("a new invite link is open for 48 hours, and for good before v16 has run", async () => {
  const db = world();
  const made = await access.createInviteLink(ASHA, HI);
  const row = db.tables.invite_tokens.find((r) => r.token === made.token);
  assert.ok(hoursLeft(row.expires_at) > 47.9 && hoursLeft(row.expires_at) <= 48);
  assert.equal(row.enabled, true);
  assert.equal(row.gate_password_hash, HI);

  const before = world();
  before.missing = { invite_tokens: ["expires_at"] };
  assert.ok(await access.createInviteLink(RAVI, HI));
  assert.equal(before.tables.invite_tokens.length, 1);
  assert.equal("expires_at" in before.tables.invite_tokens[0], false);
});

test("a direct link sets the hashcode, works once, and answers the member's request", async () => {
  const db = world({ invites: [link(ASHA, HI)] });
  db.tables.hashcode_requests.push({
    id: "request-a",
    user_id: ASHA,
    typed_name: "asha",
    device: null,
    created_at: "2026-11-27T08:00:00.000Z",
    resolved_at: null,
  });

  const made = await access.makeDirectLink(ASHA, "New\u{1F602}");
  assert.equal(made.ok, true);
  assert.ok(hoursLeft(db.tables.direct_links[0].expires_at) > 47.9);
  assert.ok(db.tables.hashcode_requests[0].resolved_at, "the request is answered");
  assert.deepEqual(await access.checkMemberLogin("asha", LAUGH), WRONG, "the old hashcode is gone");
  assert.equal((await access.checkMemberLogin("asha", "New\u{1F602}")).ok, true);

  assert.equal((await access.directLinkMember(made.token)).id, ASHA);
  assert.deepEqual(await access.checkDirectLink(made.token, LAUGH), WRONG);
  assert.equal((await access.checkDirectLink(made.token, "New\u{1F602}")).ok, true);
  assert.equal(await access.claimDirectLink(made.token), true);
  assert.equal(await access.claimDirectLink(made.token), false, "a second tab loses the race");
  assert.deepEqual(await access.checkDirectLink(made.token, "New\u{1F602}"), GONE);
  assert.equal(await access.directLinkMember(made.token), null);

  await access.releaseDirectLink(made.token);
  assert.equal((await access.checkDirectLink(made.token, "New\u{1F602}")).ok, true, "a failed sign-in gives the link back");
});

test("a new direct link replaces the last one", async () => {
  world({ invites: [link(ASHA, HI)] });
  const first = await access.makeDirectLink(ASHA, LAUGH);
  const second = await access.makeDirectLink(ASHA, LAUGH);
  assert.deepEqual(await access.checkDirectLink(first.token, LAUGH), GONE);
  assert.equal((await access.checkDirectLink(second.token, LAUGH)).ok, true);
});

test("a direct link works while the invite link has run out or is off, and makes an invite link when there is none", async () => {
  const db = world({ invites: [link(ASHA, HI, { expires_at: ago(), enabled: false })] });
  const made = await access.makeDirectLink(ASHA, LAUGH);
  assert.equal((await access.checkDirectLink(made.token, LAUGH)).ok, true);

  const forRavi = await access.makeDirectLink(RAVI, "Ravi1");
  assert.equal(forRavi.ok, true);
  const ravis = db.tables.invite_tokens.filter((r) => r.user_id === RAVI);
  assert.equal(ravis.length, 1);
  assert.ok(hoursLeft(ravis[0].expires_at) > 47.9);
  assert.equal((await access.checkDirectLink(forRavi.token, "Ravi1")).ok, true);
});

test("a direct link that has run out, or that never existed, is gone", async () => {
  const db = world({ invites: [link(ASHA, HI)] });
  db.tables.direct_links.push({
    token: "late",
    user_id: ASHA,
    created_at: "2026-11-25T09:00:00.000Z",
    expires_at: ago(),
    used_at: null,
  });
  assert.deepEqual(await access.checkDirectLink("late", LAUGH), GONE);
  assert.deepEqual(await access.checkDirectLink("nothing", LAUGH), GONE);
  assert.equal(await access.directLinkMember("late"), null);
});

test("changing the hashcode after sending a direct link makes the hashcode in that link wrong", async () => {
  const db = world({ invites: [link(ASHA, HI)] });
  const made = await access.makeDirectLink(ASHA, LAUGH);
  db.tables.invite_tokens[0].gate_password_hash = await access.hashHashcode("Other1");
  assert.deepEqual(await access.checkDirectLink(made.token, LAUGH), WRONG);
});

test("only a member who can sign in gets a direct link", async () => {
  world();
  for (const id of [JAY, OLD, GUEST, "nobody"]) {
    assert.deepEqual(await access.makeDirectLink(id, LAUGH), { ok: false, reason: "not-member" }, id);
  }
  assert.deepEqual(await access.makeDirectLink(MIRA, LAUGH), { ok: false, reason: "suspended" });
});

test("a member suspended after their direct link was sent can't use it", async () => {
  const db = world({ invites: [link(ASHA, HI)] });
  const made = await access.makeDirectLink(ASHA, LAUGH);
  db.tables.profiles.find((p) => p.id === ASHA).suspended = true;
  assert.deepEqual(await access.checkDirectLink(made.token, LAUGH), GONE);
  assert.equal(await access.directLinkMember(made.token), null);
});

test("before v16 has run, a direct link says so and changes nothing", async () => {
  const db = world({ invites: [link(ASHA, HI)], migrated: false });
  assert.deepEqual(await access.makeDirectLink(ASHA, "New1"), { ok: false, reason: "not-set-up" });
  assert.equal(db.tables.invite_tokens[0].gate_password_hash, HI);
});

test("Forgot hashcode leaves one open request per member, with what they typed and their device", async () => {
  const db = world();
  const filed = await access.fileHashcodeRequest("  Asha   Rao ", "Android · Chrome");
  assert.equal(filed.status, "filed");
  assert.equal(filed.member.id, ASHA);
  assert.equal(db.tables.hashcode_requests.length, 1);
  assert.equal(db.tables.hashcode_requests[0].typed_name, "Asha Rao");
  assert.equal(db.tables.hashcode_requests[0].device, "Android · Chrome");

  await access.fileHashcodeRequest("asha", "iPhone · Safari");
  assert.equal(db.tables.hashcode_requests.length, 1, "asking again updates the open request");
  assert.equal(db.tables.hashcode_requests[0].typed_name, "asha");
  assert.equal(db.tables.hashcode_requests[0].device, "iPhone · Safari");
});

test("a request for a name that can't sign in is dropped, and the asker is told nothing different", async () => {
  const db = world();
  for (const name of ["nobody", "jay", "mira", "old_friend", "guest_1"]) {
    assert.deepEqual(await access.fileHashcodeRequest(name, null), { status: "unknown" }, name);
  }
  assert.equal(db.tables.hashcode_requests.length, 0);
});

test("before v16 has run, a request says requests aren't available", async () => {
  world({ migrated: false });
  assert.deepEqual(await access.fileHashcodeRequest("asha", null), { status: "not-set-up" });
  assert.equal(await access.openHashcodeRequests(), null);
});

test("the admin sees open requests newest first and can dismiss one", async () => {
  const db = world();
  db.tables.hashcode_requests.push(
    { id: "r1", user_id: ASHA, typed_name: "asha", device: null, created_at: "2026-11-27T08:00:00.000Z", resolved_at: null },
    { id: "r2", user_id: RAVI, typed_name: "ravi", device: "Mac · Safari", created_at: "2026-11-27T08:30:00.000Z", resolved_at: null },
    { id: "r0", user_id: RAVI, typed_name: "ravi", device: null, created_at: "2026-11-26T08:00:00.000Z", resolved_at: "2026-11-26T09:00:00.000Z" },
  );
  assert.deepEqual((await access.openHashcodeRequests()).map((r) => r.id), ["r2", "r1"]);
  assert.equal(await access.dismissHashcodeRequest("r2"), true);
  assert.deepEqual((await access.openHashcodeRequests()).map((r) => r.id), ["r1"]);
});
