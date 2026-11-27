import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { presenceTopic, topicFromSecret } from "../src/lib/presence-topic.ts";

test("the online channel's name comes from a server secret, so the public code can't give it away", async () => {
  const topic = await topicFromSecret("one secret");
  assert.match(topic, /^presence:[0-9a-f]{32}$/);
  assert.equal(await topicFromSecret("one secret"), topic, "everyone signed in gets the same name");
  assert.notEqual(await topicFromSecret("another secret"), topic);
  assert.notEqual(topic, "blackfoxx-presence");
});

test("the name is an HMAC-SHA-256 of a fixed label, cut to 128 bits", async () => {
  const expected = createHmac("sha256", "one secret").update("blackfoxx presence").digest("hex").slice(0, 32);
  assert.equal(await topicFromSecret("one secret"), `presence:${expected}`);
});

test("pages get the name made from the service-role key, worked out once", async () => {
  assert.equal(await presenceTopic(), await topicFromSecret("test-service-key"));
  assert.equal(presenceTopic(), presenceTopic());
});
