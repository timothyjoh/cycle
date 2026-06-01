import test from "node:test";
import { strict as assert } from "node:assert";
import { runCompressOutputHook } from "../../src/cli/compress-output-hook.ts";

const CTX = { execPath: "/usr/bin/node", cliPath: "/repo/dist/cycle.js" };

test("rewrites an allowlisted read command", () => {
  const stdin = JSON.stringify({ tool_input: { command: "git status" } });
  const r = runCompressOutputHook(stdin, CTX);
  assert.equal(r.exitCode, 0);
  const payload = JSON.parse(r.stdout);
  assert.equal(payload.hookSpecificOutput.hookEventName, "PreToolUse");
  const rewritten = payload.hookSpecificOutput.updatedInput.command;
  assert.match(rewritten, /compress-output/);
  // Success path must NOT emit a diagnostic (no stderr spam on normal traffic).
  assert.equal(r.stderr, undefined);
});

test("passes through a command with shell operators", () => {
  const stdin = JSON.stringify({ tool_input: { command: "git log | head" } });
  const r = runCompressOutputHook(stdin, CTX);
  assert.equal(r.exitCode, 0);
  assert.equal(r.stdout, "");
  // Normal passthrough — no diagnostic.
  assert.equal(r.stderr, undefined);
});

test("passes through a non-allowlisted binary", () => {
  const stdin = JSON.stringify({ tool_input: { command: "rm -rf /" } });
  const r = runCompressOutputHook(stdin, CTX);
  assert.equal(r.exitCode, 0);
  assert.equal(r.stdout, "");
  // Normal passthrough — no diagnostic.
  assert.equal(r.stderr, undefined);
});

test("passes through (with diagnostic) when command is missing", () => {
  const stdin = JSON.stringify({ tool_input: {} });
  const r = runCompressOutputHook(stdin, CTX);
  assert.equal(r.exitCode, 0);
  assert.equal(r.stdout, "");
  // Schema-drift degrade path: surfaces the distinct non-string diagnostic.
  assert.ok(r.stderr && r.stderr.length > 0);
  assert.match(r.stderr, /^cycle compress-output-hook:/);
  assert.match(r.stderr, /no string tool_input\.command/);
});

test("passes through (with diagnostic) when command is not a string", () => {
  const stdin = JSON.stringify({ tool_input: { command: 42 } });
  const r = runCompressOutputHook(stdin, CTX);
  assert.equal(r.exitCode, 0);
  assert.equal(r.stdout, "");
  assert.ok(r.stderr && r.stderr.length > 0);
  assert.match(r.stderr, /no string tool_input\.command/);
});

test("fails open (with diagnostic) on malformed JSON", () => {
  const stdin = "{not json";
  const r = runCompressOutputHook(stdin, CTX);
  assert.equal(r.exitCode, 0);
  assert.equal(r.stdout, "");
  // Catch path MUST surface a diagnostic, distinct from the non-string one.
  assert.ok(r.stderr && r.stderr.length > 0);
  assert.match(r.stderr, /^cycle compress-output-hook:/);
  assert.match(r.stderr, /could not parse/);
});

test("fails open (with diagnostic) on empty stdin", () => {
  const stdin = "";
  const r = runCompressOutputHook(stdin, CTX);
  assert.equal(r.exitCode, 0);
  assert.equal(r.stdout, "");
  // Empty stdin hits JSON.parse → catch path.
  assert.match(r.stderr ?? "", /could not parse/);
});

test("the catch and non-string diagnostics are distinct messages", () => {
  const catchMsg = runCompressOutputHook("{not json", CTX).stderr;
  const nonStringMsg = runCompressOutputHook(
    JSON.stringify({ tool_input: { command: 42 } }),
    CTX,
  ).stderr;
  assert.ok(catchMsg && nonStringMsg);
  assert.notEqual(catchMsg, nonStringMsg);
});

test("loops over odd inputs and never blocks", () => {
  // Every odd top-level value parses to a non-object/non-string command, so it
  // takes the non-string degrade path: exit 0, empty stdout, never blocks.
  for (const value of [null, true, [], "a string", 7]) {
    const stdin = JSON.stringify(value);
    const r = runCompressOutputHook(stdin, CTX);
    assert.equal(r.exitCode, 0);
    assert.equal(r.stdout, "");
  }
});
