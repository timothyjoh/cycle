import { test } from "node:test";
import assert from "node:assert/strict";
import { isRateLimitError } from "../../src/engine/rate-limit.ts";

test("isRateLimitError — exit 429 returns true regardless of output", () => {
  assert.equal(isRateLimitError({ exitCode: 429, stderr: "", stdout: "" }), true);
});

test("isRateLimitError — exit 1 + 'rate limit' in stderr returns true", () => {
  assert.equal(isRateLimitError({ exitCode: 1, stderr: "rate limit exceeded", stdout: "" }), true);
});

test("isRateLimitError — exit 1 + '429' in stderr returns true", () => {
  assert.equal(isRateLimitError({ exitCode: 1, stderr: "429 error", stdout: "" }), true);
});

test("isRateLimitError — exit 1 + 'Too Many Requests' in stderr returns true", () => {
  assert.equal(isRateLimitError({ exitCode: 1, stderr: "Too Many Requests", stdout: "" }), true);
});

test("isRateLimitError — exit 1 + pattern in stdout returns true", () => {
  assert.equal(isRateLimitError({ exitCode: 1, stderr: "", stdout: "rate limit reached" }), true);
});

test("isRateLimitError — exit 1 + unrelated stderr returns false", () => {
  assert.equal(isRateLimitError({ exitCode: 1, stderr: "command not found", stdout: "" }), false);
});

test("isRateLimitError — exit 0 + matching string returns false", () => {
  assert.equal(isRateLimitError({ exitCode: 0, stderr: "rate limit", stdout: "" }), false);
});

test("isRateLimitError — null exit code + matching string returns false", () => {
  assert.equal(isRateLimitError({ exitCode: null, stderr: "rate limit", stdout: "" }), false);
});
