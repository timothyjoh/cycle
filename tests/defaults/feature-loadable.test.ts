import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorkflow } from "../../src/engine/workflow.ts";

test("default workflows.yml loads via the engine", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle"), { recursive: true });
    await copyFile("src/defaults/workflows.yml", join(root, ".cycle/workflows.yml"));
    const w = await loadWorkflow(root, "feature");
    assert.equal(w.steps.length, 9);
    assert.equal(w.steps[0].agent, "claudecode");
    assert.equal(w.steps[6].agent, "bash");
    assert.equal(w.steps[7].name, "documentation");
    assert.equal(w.steps[7].agent, "claudecode");
    assert.equal(w.steps[8].name, "reflection");
    assert.equal(w.steps[8].agent, "claudecode");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
