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
  assert.deepEqual(names, ["plan_fix", "quick_fix", "test_fix", "verify", "commit", "pr"]);
  assert.equal(steps.length, 6, "regression guard: step count should be 6");
});

test("deployed quickfix workflow has expected step sequence", async () => {
  const y = YAML.parse(await readFile(".cycle/workflows.yml", "utf8"));
  const quickfix = y.workflows.find((w: { name: string }) => w.name === "quickfix");
  assert.ok(quickfix, ".cycle/workflows.yml should contain a quickfix workflow");
  const steps = quickfix.steps;
  const names = steps.map((s: { name: string }) => s.name);
  // .cycle is trunk-based (no_branch: true) — no pr step, uses commit-trunk.sh
  assert.deepEqual(names, ["plan_fix", "quick_fix", "test_fix", "verify", "commit"]);
  assert.equal(steps.length, 5, "regression guard: step count should be 5");
});
