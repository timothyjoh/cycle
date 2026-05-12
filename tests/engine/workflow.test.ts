import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorkflow } from "../../src/engine/workflow.ts";

test("parses a workflow with claudecode and bash steps", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const wf = join(root, ".cycle/workflows");
    await mkdir(wf, { recursive: true });
    await writeFile(join(wf, "feature.yaml"),
      `name: feature\ndescription: test\nsteps:\n  - name: spec\n    agent: claudecode\n    prompt: prompts/spec.md\n  - name: commit\n    agent: bash\n    command: scripts/commit.sh\n`, "utf8");

    const w = await loadWorkflow(root, "feature");
    assert.equal(w.name, "feature");
    assert.equal(w.steps.length, 2);
    assert.equal(w.steps[0].agent, "claudecode");
    assert.equal(w.steps[0].prompt, "prompts/spec.md");
    assert.equal(w.steps[1].agent, "bash");
    assert.equal(w.steps[1].command, "scripts/commit.sh");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
