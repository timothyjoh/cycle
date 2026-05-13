import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import YAML from "yaml";

test("default feature workflow has expected step sequence", async () => {
  const y = YAML.parse(await readFile("src/defaults/workflows.yml", "utf8"));
  const feature = y.workflows.find((w: { name: string }) => w.name === "feature");
  assert.ok(feature, "workflows.yml should contain a feature workflow");
  const names = feature.steps.map((s: { name: string }) => s.name);
  assert.deepEqual(names, ["spec", "research", "plan", "build", "review", "fix", "verify", "commit", "pr", "reflection"]);
  assert.equal(feature.steps.length, 10, "regression guard: step count should be 10");
});
