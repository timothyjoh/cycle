import { test } from "node:test";
import assert from "node:assert/strict";
import { isDenied } from "../../src/engine/path-utils.ts";

test("isDenied — prefix exact match", () => {
  assert.equal(isDenied(".claude"), true);
  assert.equal(isDenied("dist"), true);
  assert.equal(isDenied("node_modules"), true);
});

test("isDenied — prefix child match", () => {
  assert.equal(isDenied(".claude/settings.json"), true);
  assert.equal(isDenied("dist/cycle.js"), true);
  assert.equal(isDenied("node_modules/foo/bar.js"), true);
});

test("isDenied — prefix trailing slash normalised", () => {
  assert.equal(isDenied("dist/"), true);
});

test("isDenied — exact match set", () => {
  assert.equal(isDenied(".cycle/cycle.pid"), true);
});

test("isDenied — .lock suffix", () => {
  assert.equal(isDenied("package-lock.json"), false); // ends with .json, not .lock
  assert.equal(isDenied(".claude/scheduled_tasks.lock"), true);
  assert.equal(isDenied("yarn.lock"), true);
});

test("isDenied — allowed paths pass through", () => {
  assert.equal(isDenied("src/engine/run-cycle.ts"), false);
  assert.equal(isDenied("scripts/coverage-gate.mjs"), false);
  assert.equal(isDenied("docs/cycle/0199-feature-foo/BUILD.md"), false);
  assert.equal(isDenied("README.md"), false);
});
