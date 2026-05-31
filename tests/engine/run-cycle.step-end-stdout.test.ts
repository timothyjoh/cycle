import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, writeFile, readFile, stat, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runCycle, MAX_STEP_END_STDOUT } from "../../src/engine/run-cycle.ts";

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

function workflowYml(stepsBody: string): string {
  return `engine:
  max_consecutive_failures: 2
  base_branch: main
  commit:
    mode: trunk
    push: false
triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10
workflows:
  - name: feature
    max_cycle_attempts: 3
    steps:
${stepsBody}`;
}

async function setupRepo(stepsBody: string, scripts: Array<{ name: string; body: string }>) {
  const root = await mkdtemp(join(tmpdir(), "cycle-stdout-end-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "t@t"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);

  await mkdir(join(root, ".cycle/scripts"), { recursive: true });
  await writeFile(join(root, ".cycle/workflows.yml"), workflowYml(stepsBody), "utf8");
  for (const s of scripts) {
    const p = join(root, ".cycle/scripts", s.name);
    await writeFile(p, s.body, "utf8");
    await chmod(p, 0o755);
  }
  return root;
}

function findEvent(log: string, eventName: string, stepName: string): Record<string, unknown> | undefined {
  const line = log.trim().split("\n").find(l => {
    if (!l.includes(`"event":"${eventName}"`)) return false;
    try {
      return (JSON.parse(l) as { step?: string }).step === stepName;
    } catch {
      return false;
    }
  });
  return line ? JSON.parse(line) : undefined;
}

function findStepEnd(log: string, stepName: string): Record<string, unknown> {
  const ev = findEvent(log, "step.end", stepName);
  assert.ok(ev, `step.end for ${stepName} not found`);
  return ev!;
}

// Scenario 1: failure with stdout marker — capped excerpt, full artifact, pointer.
test("failed bash step.end carries capped stdout excerpt + full .out artifact + pointer", async () => {
  const root = await setupRepo(
    `      - name: verify
        agent: bash
        command: scripts/verify.sh
`,
    [{ name: "verify.sh", body: "#!/bin/bash\necho \"MARKER_XYZ on stdout\"\necho \"err detail\" >&2\nexit 1\n" }],
  );
  try {
    const r = await runCycle(root, {
      issueId: "SO-1",
      title: "stdout capture",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.failingStep, "verify");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const parsed = findStepEnd(log, "verify");
    assert.equal(parsed.status, "failed");
    assert.ok((parsed.stdout as string).includes("MARKER_XYZ"), "stdout excerpt must carry the marker");

    const artifact = parsed.stdout_artifact as string;
    assert.ok(artifact, "stdout_artifact pointer must be set");
    const full = await readFile(artifact, "utf8");
    assert.ok(full.includes("=== stdout ==="), "artifact has stdout header");
    assert.ok(full.includes("=== stderr ==="), "artifact has stderr header");
    assert.ok(full.includes("MARKER_XYZ on stdout"), "artifact has full stdout");
    assert.ok(full.includes("err detail"), "artifact has full stderr");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// Scenario 2: happy path — no stdout, no pointer, no .out file.
test("successful bash step.end omits stdout, pointer, and .out artifact", async () => {
  const root = await setupRepo(
    `      - name: ok
        agent: bash
        command: scripts/ok.sh
`,
    [{ name: "ok.sh", body: "#!/bin/bash\necho ok\nexit 0\n" }],
  );
  try {
    const r = await runCycle(root, {
      issueId: "SO-2",
      title: "ok bash step",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "ok");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const parsed = findStepEnd(log, "ok");
    assert.equal(parsed.status, "ok");
    assert.ok(!("stdout" in parsed), "successful step.end must not carry stdout");
    assert.ok(!("stdout_artifact" in parsed), "successful step.end must not carry pointer");

    await assert.rejects(
      stat(join(r.artifactDir, "ok.out")),
      (e: NodeJS.ErrnoException) => e.code === "ENOENT",
      "no .out artifact may exist on success",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// Scenario 3: empty stdout+stderr on failure — header-only artifact, pointer present, no crash.
test("failed bash step with empty output writes header-only .out and present pointer", async () => {
  const root = await setupRepo(
    `      - name: silent
        agent: bash
        command: scripts/silent.sh
`,
    [{ name: "silent.sh", body: "#!/bin/bash\nexit 1\n" }],
  );
  try {
    const r = await runCycle(root, {
      issueId: "SO-3",
      title: "silent failure",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const parsed = findStepEnd(log, "silent");
    assert.equal(parsed.status, "failed");
    assert.equal(parsed.stdout, "", "empty stdout yields an empty excerpt, not a crash");

    const artifact = parsed.stdout_artifact as string;
    assert.ok(artifact, "pointer must be present even when output is empty");
    const full = await readFile(artifact, "utf8");
    assert.equal(full, "=== stdout ===\n\n=== stderr ===\n\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// Scenario 4: artifact-write failure — exit_code preserved, terminal routing intact,
// step.output_capture_failed logged, pointer absent, excerpt still present.
test("failed bash step degrades when .out write fails without masking the failure", async () => {
  const root = await setupRepo(
    `      - name: verify
        agent: bash
        command: scripts/verify.sh
`,
    [{ name: "verify.sh", body: "#!/bin/bash\necho \"MARKER_RO\"\nexit 1\n" }],
  );
  // First run materialises the artifact dir; reuse it via an explicit cycleId.
  const first = await runCycle(root, {
    cycleId: "9001",
    issueId: "SO-4",
    title: "write failure",
    workflow: "feature",
    env: { CYCLE_BASE: "main" },
  });
  assert.equal(first.status, "failed");
  const artifactDir = first.artifactDir;
  const outPath = join(artifactDir, "verify.out");

  try {
    // Force the writeFile to fail deterministically (root-proof, unlike chmod):
    // make `verify.out` a directory so writeFile to that path raises EISDIR.
    await rm(outPath, { force: true });
    await mkdir(outPath);
    await rm(join(root, ".cycle/log.jsonl"), { force: true });
    const r = await runCycle(root, {
      cycleId: "9001",
      issueId: "SO-4",
      title: "write failure",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");
    assert.equal(r.failingStep, "verify");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const parsed = findStepEnd(log, "verify");
    assert.equal(parsed.exit_code, 1, "original exit_code preserved");
    assert.ok((parsed.stdout as string).includes("MARKER_RO"), "capped excerpt preserved on write failure");
    assert.ok(!("stdout_artifact" in parsed), "pointer omitted when write fails");

    const fail = findEvent(log, "step.output_capture_failed", "verify");
    assert.ok(fail, "write failure surfaced via step.output_capture_failed");
    assert.ok(typeof fail!.error === "string" && (fail!.error as string).length > 0, "error recorded");

    const cycleEnd = log.trim().split("\n").map(l => JSON.parse(l)).find(
      (e: { event?: string }) => e.event === "cycle.end",
    );
    assert.equal(cycleEnd.status, "failed", "terminal-failure routing intact");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// Scenario 5: capping — stdout longer than the cap is truncated in the event,
// full text persisted to the artifact.
test("failed bash step head-caps stdout excerpt while artifact holds full text", async () => {
  const root = await setupRepo(
    `      - name: flood
        agent: bash
        command: scripts/flood.sh
`,
    [{ name: "flood.sh", body: "#!/bin/bash\nfor i in $(seq 1 2500); do printf x; done\nexit 1\n" }],
  );
  try {
    const r = await runCycle(root, {
      issueId: "SO-5",
      title: "flood stdout",
      workflow: "feature",
      env: { CYCLE_BASE: "main" },
    });
    assert.equal(r.status, "failed");

    const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
    const parsed = findStepEnd(log, "flood");
    const stdout = parsed.stdout as string;
    assert.equal(stdout.length, MAX_STEP_END_STDOUT);
    assert.ok(stdout.endsWith("…"), "excerpt ends with ellipsis on overflow");

    const full = await readFile(parsed.stdout_artifact as string, "utf8");
    assert.ok(full.includes("x".repeat(2500)), "artifact holds full untruncated stdout");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
