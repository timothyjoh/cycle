import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import YAML from "yaml";

test("default quickfix workflow has expected step sequence", async () => {
  const y = YAML.parse(await readFile("src/defaults/workflows.yml", "utf8"));
  const quickfix = y.workflows.find((w: { name: string }) => w.name === "quickfix");
  assert.ok(quickfix, "workflows.yml should contain a quickfix workflow");
  const steps = quickfix.steps;
  const names = steps.map((s: { name: string }) => s.name);
  assert.deepEqual(names, ["plan_fix", "walkthrough_before", "quick_fix", "test_fix", "verify", "walkthrough_after"]);
  assert.equal(steps.length, 6, "regression guard: step count should be 6");
  // The two walkthrough steps are agent: bash with no command (intercept-handled).
  for (const n of ["walkthrough_before", "walkthrough_after"]) {
    const wt = steps.find((s: { name: string }) => s.name === n);
    assert.equal(wt.agent, "bash", `${n} is agent: bash`);
    assert.ok(!("command" in wt), `${n} has no command`);
  }
});

test("deployed quickfix workflow has expected step sequence", async () => {
  const y = YAML.parse(await readFile(".cycle/workflows.yml", "utf8"));
  const quickfix = y.workflows.find((w: { name: string }) => w.name === "quickfix");
  assert.ok(quickfix, ".cycle/workflows.yml should contain a quickfix workflow");
  const steps = quickfix.steps;
  const names = steps.map((s: { name: string }) => s.name);
  assert.deepEqual(names, ["plan_fix", "walkthrough_before", "quick_fix", "test_fix", "verify", "walkthrough_after"]);
  assert.equal(steps.length, 6, "regression guard: step count should be 6");
  // The two walkthrough steps are agent: bash with no command (intercept-handled).
  for (const n of ["walkthrough_before", "walkthrough_after"]) {
    const wt = steps.find((s: { name: string }) => s.name === n);
    assert.equal(wt.agent, "bash", `${n} is agent: bash`);
    assert.ok(!("command" in wt), `${n} has no command`);
  }
});
