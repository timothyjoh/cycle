import { test } from "node:test";
import { strict as assert } from "node:assert";
import { parseArgs } from "../../src/cli/parse-args.ts";

test("parses 'run <text>' freeform task", () => {
  const r = parseArgs(["run", "fix the login bug"]);
  assert.deepEqual(r, { command: "run", text: "fix the login bug", workflow: "feature", dryRun: false });
});

test("parses --workflow override", () => {
  const r = parseArgs(["run", "--workflow", "bug", "kill the cookie banner"]);
  assert.equal(r.workflow, "bug");
});

test("parses --dry-run", () => {
  const r = parseArgs(["run", "--dry-run", "scope something"]);
  assert.equal(r.dryRun, true);
});

test("rejects unknown command", () => {
  assert.throws(() => parseArgs(["wat"]), /unknown command/);
});
