import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/engine/workflow.ts";

async function writeConfig(root: string, body: string): Promise<void> {
  await mkdir(join(root, ".cycle"), { recursive: true });
  await writeFile(join(root, ".cycle", "workflows.yml"), body, "utf8");
}

async function makeRoot(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "cycle-defaults-test-"));
}

const HEADER = `version: 1
triage:
  agent: claudecode
  prompt: prompts/triage.md
engine:
  max_consecutive_failures: 2
`;

test("defaults: step with no agent/model/thinking inherits all three", async () => {
  const root = await makeRoot();
  try {
    await writeConfig(
      root,
      `${HEADER}defaults:
  agent: codex
  model: m1
  thinking: high
workflows:
  - name: feature
    steps:
      - { name: spec, prompt: prompts/spec.md }
`,
    );
    const cfg = await loadConfig(root);
    const step = cfg.workflows[0].steps[0];
    assert.equal(step.agent, "codex");
    assert.equal(step.model, "m1");
    assert.equal(step.thinking, "high");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("defaults: per-field override leaves the other two from defaults", async () => {
  const root = await makeRoot();
  try {
    await writeConfig(
      root,
      `${HEADER}defaults:
  agent: codex
  model: m1
  thinking: high
workflows:
  - name: feature
    steps:
      - { name: a, agent: gemini, prompt: prompts/a.md }
      - { name: b, model: m2, prompt: prompts/b.md }
      - { name: c, thinking: low, prompt: prompts/c.md }
`,
    );
    const cfg = await loadConfig(root);
    const [a, b, c] = cfg.workflows[0].steps;
    // agent override
    assert.equal(a.agent, "gemini");
    assert.equal(a.model, "m1");
    assert.equal(a.thinking, "high");
    // model override
    assert.equal(b.agent, "codex");
    assert.equal(b.model, "m2");
    assert.equal(b.thinking, "high");
    // thinking override
    assert.equal(c.agent, "codex");
    assert.equal(c.model, "m1");
    assert.equal(c.thinking, "low");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("defaults: bash step is never coerced to defaults.agent", async () => {
  const root = await makeRoot();
  try {
    await writeConfig(
      root,
      `${HEADER}defaults:
  agent: claudecode
  model: m1
  thinking: high
workflows:
  - name: feature
    steps:
      - { name: verify, agent: bash, command: scripts/verify.sh }
`,
    );
    const cfg = await loadConfig(root);
    const step = cfg.workflows[0].steps[0];
    assert.equal(step.agent, "bash");
    // model/thinking are populated from defaults but are inert downstream
    assert.equal(step.model, "m1");
    assert.equal(step.thinking, "high");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("defaults: missing agent (no step agent, no default) throws naming workflow + step", async () => {
  const root = await makeRoot();
  try {
    await writeConfig(
      root,
      `${HEADER}workflows:
  - name: feature
    steps:
      - { name: spec, prompt: prompts/spec.md }
`,
    );
    await assert.rejects(
      () => loadConfig(root),
      /workflow "feature" step "spec" has no agent and no defaults\.agent/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("defaults: unknown defaults.agent throws naming rejected value", async () => {
  const root = await makeRoot();
  try {
    await writeConfig(
      root,
      `${HEADER}defaults:
  agent: nope
workflows:
  - name: feature
    steps:
      - { name: spec, prompt: prompts/spec.md }
`,
    );
    await assert.rejects(
      () => loadConfig(root),
      /workflow "feature" step "spec" has unknown agent "nope"/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("defaults: unknown step.agent throws naming rejected value", async () => {
  const root = await makeRoot();
  try {
    await writeConfig(
      root,
      `${HEADER}workflows:
  - name: feature
    steps:
      - { name: spec, agent: nope, prompt: prompts/spec.md }
`,
    );
    await assert.rejects(
      () => loadConfig(root),
      /workflow "feature" step "spec" has unknown agent "nope"/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("defaults: non-object defaults (string) throws", async () => {
  const root = await makeRoot();
  try {
    await writeConfig(
      root,
      `${HEADER}defaults: claudecode
workflows:
  - name: feature
    steps:
      - { name: spec, agent: claudecode, prompt: prompts/spec.md }
`,
    );
    await assert.rejects(() => loadConfig(root), /defaults must be an object/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("defaults: array defaults throws (non-object guard)", async () => {
  const root = await makeRoot();
  try {
    await writeConfig(
      root,
      `${HEADER}defaults:
  - claudecode
workflows:
  - name: feature
    steps:
      - { name: spec, agent: claudecode, prompt: prompts/spec.md }
`,
    );
    await assert.rejects(() => loadConfig(root), /defaults must be an object/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("back-compat: no defaults block, explicit per-step agents resolve identically", async () => {
  const root = await makeRoot();
  try {
    await writeConfig(
      root,
      `${HEADER}workflows:
  - name: feature
    steps:
      - { name: spec,   agent: claudecode, prompt: prompts/spec.md }
      - { name: build,  agent: codex, prompt: prompts/build.md }
      - { name: verify, agent: bash, command: scripts/verify.sh }
`,
    );
    const cfg = await loadConfig(root);
    const agents = cfg.workflows[0].steps.map((s) => s.agent);
    assert.deepEqual(agents, ["claudecode", "codex", "bash"]);
    // model/thinking untouched (no defaults to apply)
    assert.equal(cfg.workflows[0].steps[0].model, undefined);
    assert.equal(cfg.workflows[0].steps[0].thinking, undefined);
    assert.equal(cfg.defaults, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
