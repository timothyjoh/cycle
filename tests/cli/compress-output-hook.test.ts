import { test } from "node:test";
import { strict as assert } from "node:assert";
import { runCompressOutputHook } from "../../src/cli/compress-output-hook.ts";

const CTX = { execPath: "/usr/bin/node", cliPath: "/app/cli.js" };

test("allowlisted operator-free command → emits updatedInput wrapping it through compress-output", () => {
  const evt = JSON.stringify({ tool_name: "Bash", tool_input: { command: "git status" } });
  const r = runCompressOutputHook(evt, CTX);
  assert.equal(r.exitCode, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, "PreToolUse");
  const rewritten = out.hookSpecificOutput.updatedInput.command;
  assert.equal(rewritten, `"/usr/bin/node" "/app/cli.js" compress-output -- git status`);
});

test("command with a shell operator → empty stdout (passthrough), exit 0", () => {
  const evt = JSON.stringify({ tool_input: { command: "git log | head" } });
  const r = runCompressOutputHook(evt, CTX);
  assert.equal(r.exitCode, 0);
  assert.equal(r.stdout, "");
});

test("non-allowlisted binary → empty stdout (passthrough), exit 0", () => {
  const evt = JSON.stringify({ tool_input: { command: "rm -rf /" } });
  const r = runCompressOutputHook(evt, CTX);
  assert.equal(r.exitCode, 0);
  assert.equal(r.stdout, "");
});

test("missing tool_input.command → empty stdout, exit 0 (fail open)", () => {
  const evt = JSON.stringify({ tool_name: "Bash", tool_input: {} });
  const r = runCompressOutputHook(evt, CTX);
  assert.equal(r.exitCode, 0);
  assert.equal(r.stdout, "");
});

test("non-string command → empty stdout, exit 0", () => {
  const evt = JSON.stringify({ tool_input: { command: 42 } });
  const r = runCompressOutputHook(evt, CTX);
  assert.equal(r.exitCode, 0);
  assert.equal(r.stdout, "");
});

test("malformed JSON → empty stdout, exit 0 (fail open, never throws)", () => {
  const r = runCompressOutputHook("{not json", CTX);
  assert.equal(r.exitCode, 0);
  assert.equal(r.stdout, "");
});

test("empty stdin → empty stdout, exit 0 (fail open)", () => {
  const r = runCompressOutputHook("", CTX);
  assert.equal(r.exitCode, 0);
  assert.equal(r.stdout, "");
});

test("forced classify error never throws and never exits non-zero", () => {
  // Pass a value that JSON.parse accepts but whose tool_input access is benign;
  // the contract is: any input → exit 0, never a throw.
  for (const input of ["null", "true", "[]", '"a string"', "123"]) {
    const r = runCompressOutputHook(input, CTX);
    assert.equal(r.exitCode, 0, `input ${input}`);
    assert.equal(r.stdout, "");
  }
});
