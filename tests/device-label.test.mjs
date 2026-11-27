import assert from "node:assert/strict";
import { test } from "node:test";
import { deviceLabel } from "../src/lib/device-label.ts";

const AGENTS = {
  "Android · Chrome":
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  "Android · Samsung Internet":
    "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  "iPhone · Safari":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  "iPhone · Chrome":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
  "Windows · Edge":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  "Mac · Firefox":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:133.0) Gecko/20100101 Firefox/133.0",
  "Mac · Safari":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
};

test("the admin sees which phone and browser asked, in a few words", () => {
  for (const [label, agent] of Object.entries(AGENTS)) assert.equal(deviceLabel(agent), label);
});

test("nothing useful to say gives nothing", () => {
  assert.equal(deviceLabel(null), null);
  assert.equal(deviceLabel(undefined), null);
  assert.equal(deviceLabel(""), null);
  assert.equal(deviceLabel("curl/8.9.1"), null);
});
