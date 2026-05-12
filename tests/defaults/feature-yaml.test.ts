import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import YAML from "yaml";

test("default feature workflow has expected step sequence", async () => {
  const y = YAML.parse(await readFile("src/defaults/workflows/feature.yaml", "utf8"));
  const names = y.steps.map((s: { name: string }) => s.name);
  assert.deepEqual(names, ["spec", "research", "plan", "build", "review", "fix", "verify", "commit", "pr"]);
});
