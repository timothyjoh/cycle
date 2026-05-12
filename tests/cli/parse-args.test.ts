import { test } from "node:test";
import { strict as assert } from "node:assert";
import { parseArgs } from "../../src/cli/parse-args.ts";

test("parses 'run <text>' freeform task", () => {
  const r = parseArgs(["run", "fix the login bug"]);
  assert.deepEqual(r, { command: "run", text: "fix the login bug", workflow: "feature", dryRun: false });
});

test("parses 'run' with no text — drain-only mode", () => {
  const r = parseArgs(["run"]);
  assert.deepEqual(r, { command: "run", text: null, workflow: "feature", dryRun: false });
});

test("parses --workflow override", () => {
  const r = parseArgs(["run", "--workflow", "bug", "kill the cookie banner"]);
  assert.equal(r.command, "run");
  if (r.command === "run") assert.equal(r.workflow, "bug");
});

test("parses --dry-run", () => {
  const r = parseArgs(["run", "--dry-run", "scope something"]);
  assert.equal(r.command, "run");
  if (r.command === "run") assert.equal(r.dryRun, true);
});

test("parses 'drop <text>' subcommand", () => {
  const r = parseArgs(["drop", "queue this task"]);
  assert.deepEqual(r, { command: "drop", text: "queue this task" });
});

test("rejects 'drop' with no text", () => {
  assert.throws(() => parseArgs(["drop"]), /drop requires task text/);
});

test("rejects unknown command", () => {
  assert.throws(() => parseArgs(["wat"]), /unknown command/);
});
