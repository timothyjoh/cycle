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
  assert.deepEqual(names, ["plan_fix", "quick_fix", "test_fix", "verify"]);
  assert.equal(steps.length, 4, "regression guard: step count should be 4");
});

test("deployed quickfix workflow has expected step sequence", async () => {
  const y = YAML.parse(await readFile(".cycle/workflows.yml", "utf8"));
  const quickfix = y.workflows.find((w: { name: string }) => w.name === "quickfix");
  assert.ok(quickfix, ".cycle/workflows.yml should contain a quickfix workflow");
  const steps = quickfix.steps;
  const names = steps.map((s: { name: string }) => s.name);
  assert.deepEqual(names, ["plan_fix", "quick_fix", "test_fix", "verify"]);
  assert.equal(steps.length, 4, "regression guard: step count should be 4");
});
