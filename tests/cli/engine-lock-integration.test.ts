import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, mkdir, chmod, appendFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync, spawn } from "node:child_process";

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
  await mkdir(cycleDir, { recursive: true });
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
  await mkdir(join(root, "docs/cycle/issues/raw"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/done"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/blocked"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/failed"), { recursive: true });
}

test("live lock → supervisor exits 1 with live-pid message, lock untouched", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-lock-live-"));
  try {
    await bootstrapRepo(root);
    const lockPath = join(root, ".cycle", "engine.lock");
    await writeFile(lockPath, String(process.pid), "utf8");

    const result = spawnSync("node", [dist, "run"], {
      cwd: root,
      encoding: "utf8",
      timeout: 10_000,
    });

    assert.notEqual(result.status, 0, `expected non-zero exit, got ${result.status}`);
    assert.ok(
      result.stderr.includes(`engine already running, pid ${process.pid}`),
      `expected live-pid message in stderr, got: ${result.stderr}`,
    );

    // supervisor did not own the lock — must not delete it
    const remaining = await readFile(lockPath, "utf8");
    assert.equal(remaining.trim(), String(process.pid));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stale lock → supervisor reclaims and exits 0 (empty queue), lock cleaned up", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-lock-stale-"));
  try {
    await bootstrapRepo(root);
    const lockPath = join(root, ".cycle", "engine.lock");
    await writeFile(lockPath, "999999999", "utf8");

    const result = spawnSync("node", [dist, "run"], {
      cwd: root,
      encoding: "utf8",
      timeout: 15_000,
    });

    assert.equal(result.status, 0, `expected clean exit, stderr: ${result.stderr}`);

    // lock must be cleaned up after normal exit
    let lockExists = true;
    try {
      await readFile(lockPath, "utf8");
    } catch {
      lockExists = false;
    }
    assert.equal(lockExists, false, "lock file should be absent after normal exit");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const slowWorkflowYml = `engine:
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
      - name: slow-step
        agent: bash
        command: scripts/slow.sh
`;

function todoFm(id: string, label: string): string {
  return [
    "---",
    `id: ${id}`,
    `title: "${label}"`,
    "workflow: feature",
    "depends_on: []",
    "triaged_at: 2026-05-13T00:00:00Z",
    "source: triage",
    "---",
    "",
    label,
    "",
  ].join("\n");
}

function queueRow(id: string, label: string): object {
  return {
    id,
    title: label,
    status: "pending",
    attempt: 0,
    depends_on: [],
    triaged_at: "2026-05-13T00:00:00Z",
  };
}

async function waitForLock(lockPath: string, timeoutMs = 10_000): Promise<void> {
  let waited = 0;
  while (waited < timeoutMs) {
    try {
      await readFile(lockPath, "utf8");
      return;
    } catch {
      /* not yet */
    }
    await new Promise((r) => setTimeout(r, 100));
    waited += 100;
  }
}

async function waitForAbsence(
  filePath: string,
  { timeout = 2_000, interval = 50 }: { timeout?: number; interval?: number } = {},
): Promise<void> {
  let waited = 0;
  while (waited < timeout) {
    try {
      await stat(filePath);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === "ENOENT") return;
      throw e;
    }
    await new Promise((r) => setTimeout(r, interval));
    waited += interval;
  }
  throw new Error(`waitForAbsence: ${filePath} still present after ${timeout} ms`);
}

test("SIGINT → supervisor exits, lock cleaned up", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-lock-sigint-"));
  try {
    await bootstrapRepo(root);
    await writeFile(join(root, ".cycle", "workflows.yml"), slowWorkflowYml, "utf8");
    const slowScript = join(root, ".cycle", "scripts", "slow.sh");
    await writeFile(slowScript, "#!/bin/bash\nsleep 30\n", "utf8");
    await chmod(slowScript, 0o755);

    const todoId = "test-sigint-issue";
    await writeFile(join(root, "docs/cycle/issues/todo", `${todoId}.md`), todoFm(todoId, "sigint test"), "utf8");
    await appendFile(join(root, ".cycle/tbd.jsonl"), JSON.stringify(queueRow(todoId, "sigint test")) + "\n", "utf8");

    const lockPath = join(root, ".cycle", "engine.lock");
    const child = spawn("node", [dist, "run"], { cwd: root, stdio: "ignore" });
    await waitForLock(lockPath);

    child.kill("SIGINT");
    await Promise.race([
      new Promise<void>((r) => child.on("exit", () => r())),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("child did not exit after SIGINT")), 5_000),
      ),
    ]);

    let lockExists = true;
    try {
      await readFile(lockPath, "utf8");
    } catch {
      lockExists = false;
    }
    assert.equal(lockExists, false, "lock should be absent after SIGINT");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("SIGTERM → supervisor exits, lock cleaned up", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-lock-sigterm-"));
  try {
    await bootstrapRepo(root);
    await writeFile(join(root, ".cycle", "workflows.yml"), slowWorkflowYml, "utf8");
    const slowScript = join(root, ".cycle", "scripts", "slow.sh");
    await writeFile(slowScript, "#!/bin/bash\nsleep 30\n", "utf8");
    await chmod(slowScript, 0o755);

    const todoId = "test-sigterm-issue";
    await writeFile(join(root, "docs/cycle/issues/todo", `${todoId}.md`), todoFm(todoId, "sigterm test"), "utf8");
    await appendFile(join(root, ".cycle/tbd.jsonl"), JSON.stringify(queueRow(todoId, "sigterm test")) + "\n", "utf8");

    const lockPath = join(root, ".cycle", "engine.lock");
    const child = spawn("node", [dist, "run"], { cwd: root, stdio: "ignore" });
    await waitForLock(lockPath);

    child.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((r) => child.on("exit", () => r())),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("child did not exit after SIGTERM")), 5_000),
      ),
    ]);

    await waitForAbsence(lockPath);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
