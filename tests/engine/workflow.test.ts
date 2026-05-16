import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorkflow, loadConfig } from "../../src/engine/workflow.ts";

const ENGINE_TRIAGE = `engine:
  max_consecutive_failures: 2
  base_branch: main
triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10
`;

async function writeConfig(root: string, body: string): Promise<void> {
  await mkdir(join(root, ".cycle"), { recursive: true });
  await writeFile(join(root, ".cycle/workflows.yml"), body, "utf8");
}

test("parses a workflow with claudecode and bash steps", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await writeConfig(root,
      `${ENGINE_TRIAGE}workflows:
  - name: feature
    description: test
    max_cycle_attempts: 3
    steps:
      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
      - name: commit
        agent: bash
        command: scripts/commit.sh
`);

    const w = await loadWorkflow(root, "feature");
    assert.equal(w.name, "feature");
    assert.equal(w.max_cycle_attempts, 3);
    assert.equal(w.steps.length, 2);
    assert.equal(w.steps[0].agent, "claudecode");
    assert.equal(w.steps[0].prompt, "prompts/spec.md");
    assert.equal(w.steps[1].agent, "bash");
    assert.equal(w.steps[1].command, "scripts/commit.sh");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("picks the named workflow from a multi-entry workflows array", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await writeConfig(root,
      `${ENGINE_TRIAGE}workflows:
  - name: feature
    max_cycle_attempts: 3
    steps:
      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
  - name: bug
    max_cycle_attempts: 1
    steps:
      - name: reproduce
        agent: claudecode
        prompt: prompts/reproduce.md
      - name: fix
        agent: claudecode
        prompt: prompts/fix.md
`);

    const w = await loadWorkflow(root, "bug");
    assert.equal(w.name, "bug");
    assert.equal(w.max_cycle_attempts, 1);
    assert.equal(w.steps.length, 2);
    assert.equal(w.steps[0].name, "reproduce");
    assert.equal(w.steps[1].name, "fix");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loadConfig exposes engine and triage sections", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await writeConfig(root,
      `engine:
  max_consecutive_failures: 5
  base_branch: master
triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 12
workflows:
  - name: feature
    max_cycle_attempts: 3
    steps:
      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
`);
    const cfg = await loadConfig(root);
    assert.equal(cfg.engine.max_consecutive_failures, 5);
    assert.equal(cfg.engine.base_branch, "master");
    assert.equal(cfg.triage.agent, "claudecode");
    assert.equal(cfg.triage.prompt, "prompts/triage.md");
    assert.equal(cfg.triage.max_turns, 12);
    assert.equal(cfg.workflows.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loadWorkflow throws when workflows.yml is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await assert.rejects(() => loadWorkflow(root, "feature"), /workflows\.yml missing/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loadConfig throws when top-level is not an object", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await writeConfig(root, "");
    await assert.rejects(() => loadConfig(root), /not an object/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loadConfig throws on missing engine section", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await writeConfig(root,
      `triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10
workflows:
  - name: feature
    max_cycle_attempts: 3
    steps:
      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
`);
    await assert.rejects(() => loadConfig(root), /missing engine/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loadConfig throws on missing triage section", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await writeConfig(root,
      `engine:
  max_consecutive_failures: 2
  base_branch: main
workflows:
  - name: feature
    max_cycle_attempts: 3
    steps:
      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
`);
    await assert.rejects(() => loadConfig(root), /missing triage/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loadConfig throws when workflows is not an array", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await writeConfig(root, ENGINE_TRIAGE);
    await assert.rejects(() => loadConfig(root), /workflows must be an array/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loadConfig throws when a workflow entry is missing name or steps", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await writeConfig(root,
      `${ENGINE_TRIAGE}workflows:
  - name: feature
    max_cycle_attempts: 3
`);
    await assert.rejects(() => loadConfig(root), /missing name or steps/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("engine.commit absent — defaults to mode:trunk push:true", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await writeConfig(root,
      `${ENGINE_TRIAGE}workflows:
  - name: feature
    max_cycle_attempts: 3
    steps:
      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
`);
    const cfg = await loadConfig(root);
    assert.equal(cfg.engine.commit.mode, "trunk");
    assert.equal(cfg.engine.commit.push, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("engine.commit present — parsed correctly", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await writeConfig(root,
      `engine:
  max_consecutive_failures: 2
  base_branch: main
  commit:
    mode: local-only
    push: false
triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10
workflows:
  - name: feature
    max_cycle_attempts: 3
    steps:
      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
`);
    const cfg = await loadConfig(root);
    assert.equal(cfg.engine.commit.mode, "local-only");
    assert.equal(cfg.engine.commit.push, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("engine.commit unknown mode — throws at parse time", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await writeConfig(root,
      `engine:
  max_consecutive_failures: 2
  base_branch: main
  commit:
    mode: banana
    push: true
triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10
workflows:
  - name: feature
    max_cycle_attempts: 3
    steps:
      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
`);
    await assert.rejects(() => loadConfig(root), /engine\.commit\.mode/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loadWorkflow throws on unknown workflow name", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    await writeConfig(root,
      `${ENGINE_TRIAGE}workflows:
  - name: feature
    max_cycle_attempts: 3
    steps:
      - name: spec
        agent: claudecode
        prompt: prompts/spec.md
`);
    await assert.rejects(() => loadWorkflow(root, "nope"), /unknown workflow: nope/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
