import { test } from "node:test";
import { strict as assert } from "node:assert";
import { parseArgs } from "../../src/cli/parse-args.ts";

test("parses 'run <text>' freeform task", () => {
  const r = parseArgs(["run", "fix the login bug"]);
  assert.deepEqual(r, { command: "run", text: "fix the login bug", workflow: "feature", workflowExplicit: undefined, dryRun: false, noSkipCompleted: false, trunk: false, skipPreflight: false });
});

test("parses 'run' with no text — drain-only mode", () => {
  const r = parseArgs(["run"]);
  assert.deepEqual(r, { command: "run", text: null, workflow: "feature", workflowExplicit: undefined, dryRun: false, noSkipCompleted: false, trunk: false, skipPreflight: false });
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
  if (r.command === "run") {
    assert.equal(r.workflow, "bug");
    assert.equal(r.workflowExplicit, "bug");
  }
});

test("--workflow absent ⇒ workflowExplicit undefined, workflow 'feature'", () => {
  const r = parseArgs(["run"]);
  assert.equal(r.command, "run");
  if (r.command === "run") {
    assert.equal(r.workflowExplicit, undefined);
    assert.equal(r.workflow, "feature");
  }
});

test("trailing value-less --workflow does not throw and yields workflowExplicit ''", () => {
  assert.doesNotThrow(() => parseArgs(["run", "--workflow"]));
  const r = parseArgs(["run", "--workflow"]);
  assert.equal(r.command, "run");
  if (r.command === "run") {
    assert.equal(r.workflowExplicit, "");
    assert.equal(r.workflow, "");
  }
});

test("--workflow does not swallow a following flag as its value", () => {
  // Parity with the doctor dispatch: `--workflow --dry-run` treats `--dry-run`
  // as the (unknown) workflow value, surfaced loud by the gate downstream.
  const r = parseArgs(["run", "--workflow", "--dry-run"]);
  assert.equal(r.command, "run");
  if (r.command === "run") {
    assert.equal(r.workflowExplicit, "--dry-run");
    assert.equal(r.dryRun, false);
  }
});

test("--workflow=feature equals form ⇒ workflowExplicit/workflow 'feature', no throw", () => {
  assert.doesNotThrow(() => parseArgs(["run", "--workflow=feature"]));
  const r = parseArgs(["run", "--workflow=feature"]);
  assert.equal(r.command, "run");
  if (r.command === "run") {
    assert.equal(r.workflowExplicit, "feature");
    assert.equal(r.workflow, "feature");
  }
});

test("--workflow=bug equals form with trailing text preserves the positional", () => {
  const r = parseArgs(["run", "--workflow=bug", "text"]);
  assert.equal(r.command, "run");
  if (r.command === "run") {
    assert.equal(r.workflowExplicit, "bug");
    assert.equal(r.workflow, "bug");
    assert.equal(r.text, "text");
  }
});

test("value-less --workflow= equals form ⇒ workflowExplicit '' (gate-rejected)", () => {
  assert.doesNotThrow(() => parseArgs(["run", "--workflow="]));
  const r = parseArgs(["run", "--workflow="]);
  assert.equal(r.command, "run");
  if (r.command === "run") {
    assert.equal(r.workflowExplicit, "");
    assert.equal(r.workflow, "");
  }
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

test("parses --skip-preflight flag", () => {
  const r = parseArgs(["run", "--skip-preflight"]);
  assert.equal(r.command, "run");
  if (r.command === "run") assert.equal(r.skipPreflight, true);
});

test("--skip-preflight defaults to false", () => {
  const r = parseArgs(["run", "fix it"]);
  assert.equal(r.command, "run");
  if (r.command === "run") assert.equal(r.skipPreflight, false);
});

test("parses [] (no args) — defaults to run drain-only mode", () => {
  const r = parseArgs([]);
  assert.deepEqual(r, { command: "run", text: null, workflow: "feature", workflowExplicit: undefined, dryRun: false, noSkipCompleted: false, trunk: false, skipPreflight: false });
});

test("parseArgs(['run', '--help']) does not throw ERR_PARSE_ARGS_UNKNOWN_OPTION", () => {
  assert.doesNotThrow(() => parseArgs(["run", "--help"]));
  const r = parseArgs(["run", "--help"]);
  assert.equal(r.command, "run");
});

test("parseArgs(['--help']) — handled upstream in cli.ts, throws at parse-args level", () => {
  // --help with no 'run' prefix is intercepted before parseArgs in cli.ts.
  // At the parse-args level it is still an unknown command.
  assert.throws(() => parseArgs(["--help"]), /unknown command/);
});
