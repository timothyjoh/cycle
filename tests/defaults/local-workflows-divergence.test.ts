// regression pin for cycle 0046 incident — sync-defaults clobber wiped trunk-based shape
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import YAML from "yaml";

type StepEntry = { name: string };
type WorkflowEntry = { name: string; steps: StepEntry[]; no_branch?: boolean };

test("local .cycle/workflows.yml preserves trunk-based shape", async () => {
  const y = YAML.parse(await readFile(".cycle/workflows.yml", "utf8"));
  const feature = y.workflows.find((w: WorkflowEntry) => w.name === "feature");
  assert.ok(feature, "feature workflow must exist in .cycle/workflows.yml");
  assert.ok(!feature.no_branch, "feature.no_branch must be absent — engine.commit.mode owns branching");
  const hasCommitStep = feature.steps.some((s: StepEntry) => s.name === "commit");
  assert.ok(!hasCommitStep, "commit must not be a workflow step — engine manages commit lifecycle");
  const hasPrStep = feature.steps.some((s: StepEntry) => s.name === "pr");
  assert.ok(!hasPrStep, "pr must not be a workflow step — engine manages pr creation");
  assert.equal(y.engine?.commit?.mode, "worktree-pr", "engine.commit.mode must be worktree-pr — trunk-based enforced via CYCLE_TRUNK_BASED=1");
});
