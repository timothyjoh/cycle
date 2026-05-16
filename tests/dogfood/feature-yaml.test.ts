import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import YAML from "yaml";

test("dogfood feature workflow has expected step sequence", async () => {
  const y = YAML.parse(await readFile(".cycle/workflows.yml", "utf8"));
  const feature = y.workflows.find((w) => w.name === "feature");
  assert.ok(feature, "workflows.yml should contain a feature workflow");
  const names = feature.steps.map((s) => s.name);
  assert.deepEqual(names, ["spec", "research", "plan", "build", "review", "fix", "verify", "commit"]);
  assert.equal(feature.steps.length, 8, "regression guard: step count should be 8");
});

test("dogfood feature workflow has trunk-based divergence invariants", async () => {
  const y = YAML.parse(await readFile(".cycle/workflows.yml", "utf8"));
  const feature = y.workflows.find((w) => w.name === "feature");
  assert.ok(feature, "workflows.yml should contain a feature workflow");
  assert.equal(feature.no_branch, true, "dogfood feature workflow must have no_branch: true");
  const hasTrunkCommit = feature.steps.some((s) => s.command?.includes("commit-trunk.sh"));
  assert.ok(hasTrunkCommit, "feature workflow must have a step referencing commit-trunk.sh");
  const hasPr = feature.steps.some((s) => s.name === "pr");
  assert.ok(!hasPr, "dogfood feature workflow must not have a pr step");
});
