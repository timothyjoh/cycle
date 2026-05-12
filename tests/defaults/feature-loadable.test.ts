import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorkflow } from "../../src/engine/workflow.ts";

test("default feature.yaml loads via the engine", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await mkdir(join(root, ".cycle/workflows"), { recursive: true });
    await copyFile("src/defaults/workflows/feature.yaml", join(root, ".cycle/workflows/feature.yaml"));
    const w = await loadWorkflow(root, "feature");
    assert.equal(w.steps.length, 7);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
