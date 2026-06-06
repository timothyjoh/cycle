import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, resolveStepTimeoutMs } from "../../src/engine/workflow.ts";

async function writeConfig(root: string, body: string): Promise<void> {
  await mkdir(join(root, ".cycle"), { recursive: true });
  await writeFile(join(root, ".cycle", "workflows.yml"), body, "utf8");
}

async function makeRoot(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "cycle-timeout-test-"));
}

const HEADER = `version: 1
triage:
  agent: claudecode
  prompt: prompts/triage.md
`;

// engine block with an explicit step_timeout_ms default.
const ENGINE_WITH_DEFAULT = `engine:
  max_consecutive_failures: 2
  step_timeout_ms: 100000
`;

// engine block with NO step_timeout_ms (final fallback ⇒ undefined / no timer).
const ENGINE_NO_DEFAULT = `engine:
  max_consecutive_failures: 2
`;

// --- Pure-helper direct tests ----------------------------------------------

test("resolveStepTimeoutMs: step wins over workflow and engine", () => {
  assert.equal(resolveStepTimeoutMs(300000, 200000, 100000), 300000);
});

test("resolveStepTimeoutMs: workflow wins when step absent/invalid", () => {
  assert.equal(resolveStepTimeoutMs(undefined, 200000, 100000), 200000);
  assert.equal(resolveStepTimeoutMs(0, 200000, 100000), 200000);
  assert.equal(resolveStepTimeoutMs(-1, 200000, 100000), 200000);
});

test("resolveStepTimeoutMs: engine value is the un-coerced final fallback", () => {
  assert.equal(resolveStepTimeoutMs(undefined, undefined, 100000), 100000);
  // engine value passed through raw (not coerced): even a non-positive engine
  // value is returned verbatim so the no-override path is byte-for-byte.
  assert.equal(resolveStepTimeoutMs(undefined, undefined, 0), 0);
  assert.equal(resolveStepTimeoutMs(undefined, undefined, undefined), undefined);
});

test("resolveStepTimeoutMs: malformed/non-positive step+workflow fall through, never throws, never non-positive", () => {
  for (const bad of [0, -1, 1.5, NaN, Infinity, -Infinity, "600000", null, {}, true]) {
    // both step and workflow invalid ⇒ engine fallback
    assert.equal(resolveStepTimeoutMs(bad as unknown, bad as unknown, 100000), 100000);
    // invalid step, valid workflow ⇒ workflow
    assert.equal(resolveStepTimeoutMs(bad as unknown, 200000, 100000), 200000);
  }
});

test("resolveStepTimeoutMs: non-integer step (1.5) falls through to workflow", () => {
  assert.equal(resolveStepTimeoutMs(1.5, 200000, 100000), 200000);
});

// --- loadConfig end-to-end resolution --------------------------------------

test("loadConfig: step timeout_ms wins over workflow and engine", async () => {
  const root = await makeRoot();
  try {
    await writeConfig(
      root,
      `${HEADER}${ENGINE_WITH_DEFAULT}workflows:
  - name: feature
    timeout_ms: 200000
    steps:
      - { name: build, agent: claudecode, prompt: prompts/build.md, timeout_ms: 300000 }
`,
    );
    const cfg = await loadConfig(root);
    assert.equal(cfg.workflows[0].steps[0].timeout_ms, 300000);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loadConfig: workflow timeout_ms applies when step absent", async () => {
  const root = await makeRoot();
  try {
    await writeConfig(
      root,
      `${HEADER}${ENGINE_WITH_DEFAULT}workflows:
  - name: feature
    timeout_ms: 200000
    steps:
      - { name: build, agent: claudecode, prompt: prompts/build.md }
      - { name: review, agent: claudecode, prompt: prompts/review.md, timeout_ms: 50000 }
`,
    );
    const cfg = await loadConfig(root);
    assert.equal(cfg.workflows[0].steps[0].timeout_ms, 200000);
    assert.equal(cfg.workflows[0].steps[1].timeout_ms, 50000);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loadConfig: engine default applies when step+workflow absent", async () => {
  const root = await makeRoot();
  try {
    await writeConfig(
      root,
      `${HEADER}${ENGINE_WITH_DEFAULT}workflows:
  - name: feature
    steps:
      - { name: build, agent: claudecode, prompt: prompts/build.md }
`,
    );
    const cfg = await loadConfig(root);
    assert.equal(cfg.workflows[0].steps[0].timeout_ms, 100000);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loadConfig: no timeout_ms anywhere ⇒ step.timeout_ms === engine value (regression), undefined when engine absent", async () => {
  const root = await makeRoot();
  try {
    await writeConfig(
      root,
      `${HEADER}${ENGINE_NO_DEFAULT}workflows:
  - name: feature
    steps:
      - { name: build, agent: claudecode, prompt: prompts/build.md }
`,
    );
    const cfg = await loadConfig(root);
    assert.equal(cfg.workflows[0].steps[0].timeout_ms, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loadConfig: malformed step timeout_ms falls through to workflow (no throw)", async () => {
  const root = await makeRoot();
  try {
    await writeConfig(
      root,
      `${HEADER}${ENGINE_WITH_DEFAULT}workflows:
  - name: feature
    timeout_ms: 200000
    steps:
      - { name: a, agent: claudecode, prompt: prompts/a.md, timeout_ms: 0 }
      - { name: b, agent: claudecode, prompt: prompts/b.md, timeout_ms: -5 }
      - { name: c, agent: claudecode, prompt: prompts/c.md, timeout_ms: 1.5 }
`,
    );
    const cfg = await loadConfig(root);
    const [a, b, c] = cfg.workflows[0].steps;
    assert.equal(a.timeout_ms, 200000);
    assert.equal(b.timeout_ms, 200000);
    assert.equal(c.timeout_ms, 200000);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loadConfig: malformed step AND workflow timeout_ms fall through to engine default (no throw)", async () => {
  const root = await makeRoot();
  try {
    await writeConfig(
      root,
      `${HEADER}${ENGINE_WITH_DEFAULT}workflows:
  - name: feature
    timeout_ms: 0
    steps:
      - { name: build, agent: claudecode, prompt: prompts/build.md, timeout_ms: -1 }
`,
    );
    const cfg = await loadConfig(root);
    assert.equal(cfg.workflows[0].steps[0].timeout_ms, 100000);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loadConfig: string timeout_ms (non-number) is ignored, falls through to engine default", async () => {
  const root = await makeRoot();
  try {
    await writeConfig(
      root,
      `${HEADER}${ENGINE_WITH_DEFAULT}workflows:
  - name: feature
    steps:
      - { name: build, agent: claudecode, prompt: prompts/build.md, timeout_ms: "600000" }
`,
    );
    const cfg = await loadConfig(root);
    assert.equal(cfg.workflows[0].steps[0].timeout_ms, 100000);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
