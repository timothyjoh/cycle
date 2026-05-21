import { test } from "node:test";
import { strict as assert } from "node:assert";
import { parseArgs } from "../../src/cli/parse-args.ts";

test("parses 'run <text>' freeform task", () => {
  const r = parseArgs(["run", "fix the login bug"]);
  assert.deepEqual(r, { command: "run", text: "fix the login bug", workflow: "feature", dryRun: false, noSkipCompleted: false, trunk: false });
});

test("parses 'run' with no text — drain-only mode", () => {
  const r = parseArgs(["run"]);
  assert.deepEqual(r, { command: "run", text: null, workflow: "feature", dryRun: false, noSkipCompleted: false, trunk: false });
});

test("parses --no-skip-completed flag", () => {
  const r = parseArgs(["run", "--no-skip-completed"]);
  assert.equal(r.command, "run");
  if (r.command === "run") assert.equal(r.noSkipCompleted, true);
});

test("--no-skip-completed defaults to false", () => {
  const r = parseArgs(["run", "fix it"]);
  assert.equal(r.command, "run");
  if (r.command === "run") assert.equal(r.noSkipCompleted, false);
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

test("drop rejects unknown flag --priority (flag removed)", () => {
  assert.throws(
    () => parseArgs(["drop", "foo", "--priority", "high"]),
    /drop:/,
  );
});

test("rejects unknown command", () => {
  assert.throws(() => parseArgs(["wat"]), /unknown command/);
});

test("parses --trunk flag", () => {
  const r = parseArgs(["run", "--trunk"]);
  assert.equal(r.command, "run");
  if (r.command === "run") assert.equal(r.trunk, true);
});

test("--trunk defaults to false", () => {
  const r = parseArgs(["run", "fix it"]);
  assert.equal(r.command, "run");
  if (r.command === "run") assert.equal(r.trunk, false);
});
