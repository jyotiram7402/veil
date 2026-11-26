import assert from "node:assert/strict";
import { test } from "node:test";
import { openMicrophone } from "../src/lib/webrtc/microphone.ts";
import { classifyMediaError, errorTag, callErrorMessage } from "../src/lib/webrtc/errors.ts";

const noWait = async () => {};

function fakeMedia(answers) {
  const asked = [];
  return {
    asked,
    async getUserMedia(constraints) {
      asked.push(constraints);
      const next = answers.shift();
      if (next instanceof Error || next instanceof DOMException) throw next;
      return next;
    },
  };
}

const stream = { id: "mic" };

test("the first try asks for the cleaned-up voice", async () => {
  const media = fakeMedia([stream]);
  assert.equal(await openMicrophone(media, undefined, noWait), stream);
  assert.equal(media.asked.length, 1);
  assert.equal(media.asked[0].audio.echoCancellation, true);
  assert.equal(media.asked[0].video, false);
});

test("a microphone that will not start the first time gets a second, plain try", async () => {
  for (const name of ["NotReadableError", "AbortError", "OverconstrainedError"]) {
    const media = fakeMedia([new DOMException("Could not start audio source", name), stream]);
    let waited = 0;
    assert.equal(await openMicrophone(media, undefined, async (ms) => (waited = ms)), stream, name);
    assert.equal(media.asked.length, 2);
    assert.deepEqual(media.asked[1], { audio: true, video: false });
    assert.equal(waited, 400);
  }
});

test("a chosen microphone that has gone falls back to the default one", async () => {
  const media = fakeMedia([new DOMException("no such device", "OverconstrainedError"), stream]);
  await openMicrophone(media, "usb-headset", noWait);
  assert.deepEqual(media.asked[0].audio.deviceId, { exact: "usb-headset" });
  assert.deepEqual(media.asked[1], { audio: true, video: false });
});

test("a refusal is not asked twice", async () => {
  const media = fakeMedia([new DOMException("Permission denied", "NotAllowedError")]);
  await assert.rejects(openMicrophone(media, undefined, noWait), { name: "NotAllowedError" });
  assert.equal(media.asked.length, 1);
});

test("if the second try fails too, its error is the one reported", async () => {
  const media = fakeMedia([
    new DOMException("Could not start audio source", "NotReadableError"),
    new DOMException("still busy", "NotReadableError"),
  ]);
  await assert.rejects(openMicrophone(media, undefined, noWait), { message: "still busy" });
});

test("only real microphone errors are called microphone errors", () => {
  assert.equal(classifyMediaError(new DOMException("x", "NotAllowedError")), "MIC_PERMISSION_DENIED");
  assert.equal(classifyMediaError(new DOMException("x", "NotFoundError")), "MIC_NOT_FOUND");
  assert.equal(classifyMediaError(new DOMException("x", "NotReadableError")), "MIC_UNAVAILABLE");
  assert.equal(classifyMediaError(new DOMException("x", "InvalidStateError")), "SETUP_FAILED");
  assert.equal(classifyMediaError(new TypeError("x is undefined")), "SETUP_FAILED");
  assert.equal(classifyMediaError("odd"), "SETUP_FAILED");
  assert.equal(callErrorMessage("SETUP_FAILED"), "The call couldn't be set up. Try again.");
});

test("the error's name is what goes on screen, nothing else", () => {
  assert.equal(errorTag(new DOMException("Could not start audio source", "NotReadableError")), "NotReadableError");
  assert.equal(errorTag(new TypeError("secret detail")), "TypeError");
  assert.equal(errorTag("odd"), null);
  assert.equal(errorTag(null), null);
});
