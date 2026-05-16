import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import YAML from "yaml";

type WorkflowEntry = { name: string; steps: { name: string; command?: string }[]; no_branch?: boolean };

test("dogfood feature workflow has expected step sequence", async () => {
  const y = YAML.parse(await readFile(".cycle/workflows.yml", "utf8"));
  const feature = y.workflows.find((w: WorkflowEntry) => w.name === "feature");
  assert.ok(feature, "workflows.yml should contain a feature workflow");
  const names = feature.steps.map((s: WorkflowEntry["steps"][number]) => s.name);
  assert.deepEqual(names, ["spec", "research", "plan", "build", "review", "fix", "verify", "documentation"]);
  assert.equal(feature.steps.length, 8, "regression guard: step count should be 8");
});

test("dogfood feature workflow has engine-managed commit (no commit step, no no_branch)", async () => {
  const y = YAML.parse(await readFile(".cycle/workflows.yml", "utf8"));
  const feature = y.workflows.find((w: WorkflowEntry) => w.name === "feature");
  assert.ok(feature, "workflows.yml should contain a feature workflow");
  assert.ok(!feature.no_branch, "no_branch field must be absent — engine.commit.mode owns branching");
  const hasCommitStep = feature.steps.some((s: WorkflowEntry["steps"][number]) => s.name === "commit");
  assert.ok(!hasCommitStep, "commit must not be a workflow step — engine handles it");
  const hasPrStep = feature.steps.some((s: WorkflowEntry["steps"][number]) => s.name === "pr");
  assert.ok(!hasPrStep, "pr must not be a workflow step");
  assert.equal(y.engine?.commit?.mode, "trunk", "engine.commit.mode must be trunk");
});
