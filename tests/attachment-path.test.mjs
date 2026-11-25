import assert from "node:assert/strict";
import { test } from "node:test";
import { attachmentPath } from "../src/lib/attachment-path.ts";

const chat = "3f2b8c1e-7a4d-4e0b-9c55-2d1f6a7b8c90";
const other = "99999999-7a4d-4e0b-9c55-2d1f6a7b8c90";
const base = "https://abcdefgh.supabase.co/storage/v1/object/sign/attachments/";

test("a signed link gives the file's path", () => {
  assert.equal(
    attachmentPath(`${base}${chat}/0b1c2d3e-photo.jpg?token=eyJhbGciOi.abc.def`, chat),
    `${chat}/0b1c2d3e-photo.jpg`,
  );
});

test("encoded characters are decoded", () => {
  assert.equal(attachmentPath(`${base}${chat}/id-my%20file.pdf?token=x`, chat), `${chat}/id-my file.pdf`);
});

test("a file of another chat is never returned", () => {
  assert.equal(attachmentPath(`${base}${other}/id-photo.jpg?token=x`, chat), null);
});

test("climbing out of the chat's folder is refused", () => {
  assert.equal(attachmentPath(`${base}${chat}/../${other}/id.jpg?token=x`, chat), null);
  assert.equal(attachmentPath(`${base}${chat}/%2E%2E/${other}/id.jpg?token=x`, chat), null);
});

test("only signed links to the attachments bucket count", () => {
  assert.equal(attachmentPath(`https://abcdefgh.supabase.co/storage/v1/object/public/avatars/${chat}/a.png`, chat), null);
  assert.equal(attachmentPath(`https://abcdefgh.supabase.co/storage/v1/object/public/attachments/${chat}/a.png`, chat), null);
  assert.equal(attachmentPath(`https://example.com/attachments/${chat}/a.png`, chat), null);
});

test("nothing, rubbish and bare folders give null", () => {
  assert.equal(attachmentPath(null, chat), null);
  assert.equal(attachmentPath(undefined, chat), null);
  assert.equal(attachmentPath("", chat), null);
  assert.equal(attachmentPath("not a url", chat), null);
  assert.equal(attachmentPath(`${base}${chat}/?token=x`, chat), null);
  assert.equal(attachmentPath(`${base}${chat}/bad%E0%A4%A.jpg?token=x`, chat), null);
});

