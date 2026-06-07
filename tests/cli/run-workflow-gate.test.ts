import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, mkdir, chmod } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

// Integration coverage for the `cycle run` start-path `--workflow` gate
// (Task 3). The gate runs after a successful config load and BEFORE
// engine.start/preflight/markInProgress, so a rejected workflow exits non-zero
// with no log line and no queue mutation.

const REPO = process.cwd();

async function ensureDist(): Promise<string> {
  const distPath = join(REPO, "dist", "cycle.js");
  await readFile(distPath, "utf8");
  return distPath;
}

async function bootstrapRepo(root: string): Promise<void> {
  spawnSync("git", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["config", "user.name", "t"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: root, stdio: "ignore" });

  const cycleDir = join(root, ".cycle");
  await mkdir(join(cycleDir, "scripts"), { recursive: true });
  const workflowYml = `engine:
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
    max_cycle_attempts: 1
    steps:
      - name: verify
        agent: bash
        command: scripts/verify.sh
`;
  await writeFile(join(cycleDir, "workflows.yml"), workflowYml, "utf8");
  const scriptPath = join(cycleDir, "scripts", "verify.sh");
  await writeFile(scriptPath, "#!/bin/bash\nexit 0\n", "utf8");
  await chmod(scriptPath, 0o755);
  for (const d of ["inbox", "todo", "done", "blocked", "failed"]) {
    await mkdir(join(root, "docs/cycle/issues", d), { recursive: true });
  }
}

function logText(root: string): string {
  const p = join(root, ".cycle", "log.jsonl");
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}

test("run --workflow <unknown> exits non-zero, names the bad value, emits no engine.start", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-wfgate-unknown-"));
  try {
    await bootstrapRepo(root);
    const result = spawnSync("node", [dist, "run", "--workflow", "nonsense", "--skip-preflight"], {
      cwd: root,
      encoding: "utf8",
      timeout: 15_000,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /run: unknown workflow "nonsense"/);
    assert.match(result.stderr, /available workflows:.*feature/);
    // No state mutation: gate precedes engine.start/cycle.start/markInProgress.
    const log = logText(root);
    assert.doesNotMatch(log, /"event":"engine\.start"/);
    assert.doesNotMatch(log, /"event":"cycle\.start"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("run --workflow=<unknown> equals form exits non-zero, names the bad value, emits no engine.start", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-wfgate-eq-unknown-"));
  try {
    await bootstrapRepo(root);
    const result = spawnSync("node", [dist, "run", "--workflow=nonsense", "--skip-preflight"], {
      cwd: root,
      encoding: "utf8",
      timeout: 15_000,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /run: unknown workflow "nonsense"/);
    assert.match(result.stderr, /available workflows:.*feature/);
    const log = logText(root);
    assert.doesNotMatch(log, /"event":"engine\.start"/);
    assert.doesNotMatch(log, /"event":"cycle\.start"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("run --workflow=feature equals form (valid) passes the gate and reaches engine.start", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-wfgate-eq-valid-"));
  try {
    await bootstrapRepo(root);
    const result = spawnSync("node", [dist, "run", "--workflow=feature", "--skip-preflight"], {
      cwd: root,
      encoding: "utf8",
      timeout: 15_000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /unknown workflow/);
    const log = logText(root);
    assert.match(log, /"event":"engine\.start"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("run --workflow (value-less) exits non-zero with requires-a-value diagnostic", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-wfgate-valueless-"));
  try {
    await bootstrapRepo(root);
    // Trailing value-less --workflow must NOT throw uncaught in parseArgs and must
    // be rejected loud by the gate.
    const result = spawnSync("node", [dist, "run", "--skip-preflight", "--workflow"], {
      cwd: root,
      encoding: "utf8",
      timeout: 15_000,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /run: --workflow requires a value/);
    assert.match(result.stderr, /available workflows:.*feature/);
    const log = logText(root);
    assert.doesNotMatch(log, /"event":"engine\.start"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("run --workflow feature (valid) passes the gate and reaches engine.start", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-wfgate-valid-"));
  try {
    await bootstrapRepo(root);
    // Empty queue ⇒ drain-only: passes the gate, emits engine.start, exits 0.
    const result = spawnSync("node", [dist, "run", "--workflow", "feature", "--skip-preflight"], {
      cwd: root,
      encoding: "utf8",
      timeout: 15_000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /unknown workflow/);
    const log = logText(root);
    assert.match(log, /"event":"engine\.start"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("bare run (no --workflow flag) defaults to feature and passes the gate", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-wfgate-default-"));
  try {
    await bootstrapRepo(root);
    const result = spawnSync("node", [dist, "run", "--skip-preflight"], {
      cwd: root,
      encoding: "utf8",
      timeout: 15_000,
    });
    assert.equal(result.status, 0, result.stderr);
    const log = logText(root);
    assert.match(log, /"event":"engine\.start"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
