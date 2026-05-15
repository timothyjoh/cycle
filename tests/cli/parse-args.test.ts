import { test } from "node:test";
import { strict as assert } from "node:assert";
import { parseArgs } from "../../src/cli/parse-args.ts";

test("parses 'run <text>' freeform task", () => {
  const r = parseArgs(["run", "fix the login bug"]);
  assert.deepEqual(r, { command: "run", text: "fix the login bug", workflow: "feature", dryRun: false, noSkipCompleted: false });
});

test("parses 'run' with no text — drain-only mode", () => {
  const r = parseArgs(["run"]);
  assert.deepEqual(r, { command: "run", text: null, workflow: "feature", dryRun: false, noSkipCompleted: false });
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
  assert.deepEqual(r, { command: "drop", text: "queue this task", priority: 3 });
});

test("rejects 'drop' with no text", () => {
  assert.throws(() => parseArgs(["drop"]), /drop requires task text/);
});

test("parses 'drop <text> --priority N'", () => {
  const r = parseArgs(["drop", "foo", "--priority", "7"]);
  assert.deepEqual(r, { command: "drop", text: "foo", priority: 7 });
});

test("parses 'drop --priority N <text>' (flag before text)", () => {
  const r = parseArgs(["drop", "--priority", "7", "foo"]);
  assert.deepEqual(r, { command: "drop", text: "foo", priority: 7 });
});

test("accepts priority boundary 1", () => {
  const r = parseArgs(["drop", "foo", "--priority", "1"]);
  assert.equal(r.command, "drop");
  if (r.command === "drop") assert.equal(r.priority, 1);
});

test("accepts priority boundary 10", () => {
  const r = parseArgs(["drop", "foo", "--priority", "10"]);
  assert.equal(r.command, "drop");
  if (r.command === "drop") assert.equal(r.priority, 10);
});

test("rejects priority 0", () => {
  assert.throws(
    () => parseArgs(["drop", "foo", "--priority", "0"]),
    /must be an integer 1\.\.10/,
  );
});

test("rejects priority 11", () => {
  assert.throws(
    () => parseArgs(["drop", "foo", "--priority", "11"]),
    /must be an integer 1\.\.10/,
  );
});

test("rejects non-integer priority", () => {
  assert.throws(
    () => parseArgs(["drop", "foo", "--priority", "3.5"]),
    /must be an integer 1\.\.10/,
  );
});

test("rejects non-numeric priority", () => {
  assert.throws(
    () => parseArgs(["drop", "foo", "--priority", "high"]),
    /must be an integer 1\.\.10/,
  );
});

test("rejects --priority with no value", () => {
  assert.throws(
    () => parseArgs(["drop", "foo", "--priority"]),
    /drop:/,
  );
});

test("rejects unknown command", () => {
  assert.throws(() => parseArgs(["wat"]), /unknown command/);
});
