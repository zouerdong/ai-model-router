import assert from "node:assert/strict";
import test from "node:test";
import { redactError, redactString, redactValue } from "../src/redact.js";

test("redacts secrets from strings and errors", () => {
  assert.equal(redactString("failed with test-secret", ["test-secret"]), "failed with <redacted>");
  assert.equal(redactError(new Error("token=test-secret"), ["test-secret"]), "token=<redacted>");
  assert.equal(redactString("failed with abcdef", ["abc", "abcdef"]), "failed with <redacted>");
});

test("redacts sensitive object fields without exposing values", () => {
  const value = redactValue({ apiKey: "test-key", nested: { message: "contains-test-key" } }, []);
  assert.deepEqual(value, { apiKey: "<redacted>", nested: { message: "contains-test-key" } });
  assert.equal(redactString(value.nested.message, ["test-key"]), "contains-<redacted>");
});
