import { test } from "node:test";
import { strict as assert } from "node:assert";
import { resolveAgent, UnknownAgentError } from "../../src/engine/exec.ts";

test("resolveAgent returns the registered claudecode module", () => {
  const mod = resolveAgent("claudecode");
  assert.equal(typeof mod.runStep, "function");
});

test("resolveAgent returns the registered codex module", () => {
  const mod = resolveAgent("codex");
  assert.equal(typeof mod.runStep, "function");
});

test("resolveAgent throws UnknownAgentError for an unregistered name", () => {
  let caught: unknown;
  try {
    resolveAgent("foo");
  } catch (e) {
    caught = e;
  }
  assert.ok(caught instanceof UnknownAgentError, "should be UnknownAgentError");
  const msg = (caught as Error).message;
  assert.match(msg, /"foo"/);
  assert.match(msg, /claudecode/);
  assert.match(msg, /codex/);
});
