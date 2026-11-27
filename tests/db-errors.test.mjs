import assert from "node:assert/strict";
import { test } from "node:test";
import { describeError, errorCode, isNotSetUp, isTaken } from "../src/lib/db-errors.ts";

test("a taken username is recognised from Postgres and from Supabase Auth", () => {
  assert.equal(isTaken({ code: "23505", message: 'duplicate key value violates unique constraint "profiles_username_key"' }), true);
  assert.equal(isTaken({ code: "email_exists", status: 422, message: "A user with this email address has already been registered" }), true);
  assert.equal(isTaken({ code: "user_already_exists" }), true);
});

test("anything else is not a taken username", () => {
  for (const error of [null, undefined, "23505", {}, { code: "42501" }, { code: 23505 }, { message: "already exists" }]) {
    assert.equal(isTaken(error), false, JSON.stringify(error));
  }
});

test("the code is read only when it is a string", () => {
  assert.equal(errorCode({ code: "same_password" }), "same_password");
  assert.equal(errorCode({ code: "" }), null);
  assert.equal(errorCode({ code: 42 }), null);
  assert.equal(errorCode(new Error("x")), null);
  assert.equal(errorCode(null), null);
});

test("the log line has the code, the status and the text, and nothing else", () => {
  const pg = { code: "42501", message: "permission denied for table profiles", details: "Key (username)=(rahul)", hint: null };
  assert.equal(describeError(pg), "42501 permission denied for table profiles");
  assert.equal(describeError({ code: "weak_password", status: 422, message: "Password is too short" }), "weak_password 422 Password is too short");
  assert.equal(describeError(new TypeError("fetch failed")), "TypeError fetch failed");
  assert.ok(!describeError(pg).includes("rahul"), "row values in details never reach the log");
});

test("a missing or odd error still gives a line", () => {
  assert.equal(describeError(null), "no error object");
  assert.equal(describeError(undefined), "no error object");
  assert.equal(describeError({}), "unknown error");
  assert.equal(describeError("boom"), "boom");
  assert.equal(describeError(7), "7");
  assert.equal(describeError("x".repeat(500)).length, 300);
});

test("a table or column that a migration has not made yet is told apart from other errors", () => {
  assert.equal(isNotSetUp({ code: "42P01", message: 'relation "public.direct_links" does not exist' }), true);
  assert.equal(isNotSetUp({ code: "PGRST205", message: "Could not find the table 'public.direct_links' in the schema cache" }), true);
  assert.equal(isNotSetUp({ code: "42703", message: 'column "expires_at" does not exist' }), true);
  assert.equal(isNotSetUp({ code: "PGRST204", message: "Could not find the 'expires_at' column of 'invite_tokens' in the schema cache" }), true);
  for (const error of [null, undefined, {}, { code: "23505" }, { code: "42501" }, { message: "does not exist" }]) {
    assert.equal(isNotSetUp(error), false, JSON.stringify(error));
  }
});
