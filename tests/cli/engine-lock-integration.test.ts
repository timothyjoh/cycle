import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, mkdir, chmod, appendFile, stat } from "node:fs/promises";
import { realpathSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync, spawn } from "node:child_process";

// The supervisor canonicalizes its lock path via realpathSync(cwd); on systems
// where tmpdir() is itself a symlink (e.g. macOS /tmp → /private/tmp) the test's
// raw root would not match. Resolve every expected lock path the same way.
function canonicalLockPath(root: string): string {
  return join(realpathSync(root), ".cycle", "engine.lock");
}

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
  await mkdir(join(root, "docs/cycle/issues/inbox"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/todo"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/done"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/blocked"), { recursive: true });
  await mkdir(join(root, "docs/cycle/issues/failed"), { recursive: true });
}

test("live lock → supervisor exits 75 with live-pid message, lock + log untouched", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-lock-live-"));
  try {
    await bootstrapRepo(root);
    const lockPath = canonicalLockPath(root);
    await writeFile(lockPath, String(process.pid), "utf8");

    // Capture log state before the rejected run. The shared log.jsonl must gain
    // zero bytes — the rejection precedes createLogger/engine.start.
    const logPath = join(realpathSync(root), ".cycle", "log.jsonl");
    const logSizeBefore = existsSync(logPath) ? statSync(logPath).size : -1;

    const result = spawnSync("node", [dist, "run", "--skip-preflight"], {
      cwd: root,
      encoding: "utf8",
      timeout: 10_000,
    });

    assert.equal(result.status, 75, `expected dedicated exit code 75, got ${result.status}`);
    assert.ok(
      result.stderr.includes(`engine already running, pid ${process.pid}`),
      `expected live-pid message in stderr, got: ${result.stderr}`,
    );

    // supervisor did not own the lock — must not delete it
    const remaining = await readFile(lockPath, "utf8");
    assert.equal(remaining.trim(), String(process.pid));

    // log.jsonl is byte-unchanged: no engine.start / preflight / triage / halt / stop
    const logSizeAfter = existsSync(logPath) ? statSync(logPath).size : -1;
    assert.equal(logSizeAfter, logSizeBefore, "rejected run must not write to log.jsonl");
    if (existsSync(logPath)) {
      const raw = await readFile(logPath, "utf8");
      const events = raw.split("\n").filter(Boolean).map((l) => JSON.parse(l));
      for (const ev of ["engine.start", "engine.preflight.ok", "engine.halted", "engine.stop"]) {
        assert.equal(
          events.filter((e: { event: string }) => e.event === ev).length,
          0,
          `rejected run must not emit ${ev}`,
        );
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("stale lock → supervisor reclaims and exits 0 (empty queue), lock cleaned up", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-lock-stale-"));
  try {
    await bootstrapRepo(root);
    const lockPath = canonicalLockPath(root);
    await writeFile(lockPath, "999999999", "utf8");

    const result = spawnSync("node", [dist, "run", "--skip-preflight"], {
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
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("lifetime: lock present + PID-correct throughout the drain, removed only on exit", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-lock-lifetime-"));
  let child!: ReturnType<typeof spawn>;
  try {
    await bootstrapRepo(root);
    await writeFile(join(root, ".cycle", "workflows.yml"), slowWorkflowYml, "utf8");
    const slowScript = join(root, ".cycle", "scripts", "slow.sh");
    await writeFile(slowScript, "#!/bin/bash\nsleep 30\n", "utf8");
    await chmod(slowScript, 0o755);

    const todoId = "test-lifetime-issue";
    await writeFile(join(root, "docs/cycle/issues/todo", `${todoId}.md`), todoFm(todoId, "lifetime test"), "utf8");
    await appendFile(join(root, ".cycle/tbd.jsonl"), JSON.stringify(queueRow(todoId, "lifetime test")) + "\n", "utf8");

    const lockPath = canonicalLockPath(root);
    const logPath = join(realpathSync(root), ".cycle", "log.jsonl");
    child = spawn("node", [dist, "run", "--skip-preflight"], { cwd: root, stdio: "ignore" });
    await waitForLock(lockPath, 30_000);
    // The slow bash step keeps the supervisor mid-drain; wait until a cycle is
    // genuinely in flight so we observe the lock during the run, not at startup.
    await waitForLogEvent(logPath, "issue.ingested", 30_000);

    // Mid-drain: lock is on disk and holds the live supervisor's PID.
    assert.ok(existsSync(lockPath), "lock present during drain");
    const held = (await readFile(lockPath, "utf8")).trim();
    assert.equal(held, String(child.pid), "lock holds the live supervisor PID");

    // Removed only when the supervisor itself exits.
    let exitCode: number | null = null;
    child.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((r) => child.on("exit", (code) => { exitCode = code; r(); })),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("child did not exit after SIGTERM")), 10_000),
      ),
    ]);
    assert.strictEqual(exitCode, 143, "should exit 143 on SIGTERM");
    await waitForAbsence(lockPath);
  } finally {
    child?.kill();
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
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

async function waitForLogEvent(
  logPath: string,
  eventName: string,
  timeoutMs = 20_000,
): Promise<void> {
  let waited = 0;
  while (waited < timeoutMs) {
    try {
      const raw = await readFile(logPath, "utf8");
      const events = raw.split("\n").filter(Boolean).map((l) => JSON.parse(l));
      if (events.some((e: { event: string }) => e.event === eventName)) return;
    } catch {
      /* log not yet created */
    }
    await new Promise((r) => setTimeout(r, 100));
    waited += 100;
  }
  throw new Error(`waitForLogEvent: "${eventName}" not found within ${timeoutMs}ms`);
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

    const lockPath = canonicalLockPath(root);
    const child = spawn("node", [dist, "run", "--skip-preflight"], { cwd: root, stdio: "ignore" });
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
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("SIGTERM → supervisor exits, lock cleaned up, cycle.killed logged", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-lock-sigterm-"));
  let child!: ReturnType<typeof spawn>;
  try {
    await bootstrapRepo(root);
    await writeFile(join(root, ".cycle", "workflows.yml"), slowWorkflowYml, "utf8");
    const slowScript = join(root, ".cycle", "scripts", "slow.sh");
    await writeFile(slowScript, "#!/bin/bash\nsleep 30\n", "utf8");
    await chmod(slowScript, 0o755);

    const todoId = "test-sigterm-issue";
    await writeFile(join(root, "docs/cycle/issues/todo", `${todoId}.md`), todoFm(todoId, "sigterm test"), "utf8");
    await appendFile(join(root, ".cycle/tbd.jsonl"), JSON.stringify(queueRow(todoId, "sigterm test")) + "\n", "utf8");

    const lockPath = canonicalLockPath(root);
    const logPath = join(root, ".cycle", "log.jsonl");
    child = spawn("node", [dist, "run", "--skip-preflight"], { cwd: root, stdio: "ignore" });
    // issue.ingested is emitted by the supervisor after activeCycleId is set (both happen
    // before run-one is spawned), so waiting for it is sufficient to guarantee the handler
    // will write a populated cycle_id without requiring subprocess startup.
    await waitForLock(lockPath, 30_000);
    await waitForLogEvent(logPath, "issue.ingested", 30_000);

    let exitCode: number | null = null;
    child.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((r) => child.on("exit", (code) => { exitCode = code; r(); })),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("child did not exit after SIGTERM")), 10_000),
      ),
    ]);

    assert.strictEqual(exitCode, 143, "should exit 143 on SIGTERM");
    await waitForAbsence(lockPath);

    const rawLog = await readFile(join(root, ".cycle", "log.jsonl"), "utf8");
    const events = rawLog.split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const killed = events.filter((e: { event: string }) => e.event === "cycle.killed");
    assert.strictEqual(killed.length, 1, "exactly one cycle.killed event");
    assert.ok(typeof killed[0].ts === "string", "ts is a string");
    assert.ok(typeof killed[0].cycle_id === "string", "cycle_id populated when cycle was in progress");
  } finally {
    child?.kill();
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test("SIGTERM idle engine: cycle.killed written with cycle_id undefined", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-sigterm-idle-"));
  const fakeBinDir = await mkdtemp(join(tmpdir(), "cycle-fake-bin-"));
  let child!: ReturnType<typeof spawn>;
  try {
    await bootstrapRepo(root);
    await writeFile(join(root, ".cycle", "workflows.yml"), slowWorkflowYml, "utf8");

    // Fake claude binary: answers --version immediately (so the engine-start
    // preflight probe passes fast) but sleeps on the triage invocation — which
    // keeps the engine alive in the triage phase for the SIGTERM test.
    const fakeClaude = join(fakeBinDir, "claude");
    await writeFile(
      fakeClaude,
      "#!/bin/bash\ncase \"$1\" in --version) echo 0.0.0; exit 0 ;; esac\nsleep 30\n",
      "utf8",
    );
    await chmod(fakeClaude, 0o755);

    // Triage prompt required by runTriage before agent is invoked
    await mkdir(join(root, ".cycle", "prompts"), { recursive: true });
    await writeFile(join(root, ".cycle", "prompts", "triage.md"), "triage prompt", "utf8");

    // Raw inbox file triggers triage (no queue items, so no cycle starts)
    await writeFile(
      join(root, "docs/cycle/issues/inbox", "idle-raw-issue.md"),
      "---\nid: idle-raw-issue\n---\nidle test issue\n",
      "utf8",
    );

    const lockPath = canonicalLockPath(root);
    const logPath = join(root, ".cycle", "log.jsonl");
    child = spawn("node", [dist, "run", "--skip-preflight"], {
      cwd: root,
      stdio: "ignore",
      env: { ...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ""}` },
    });
    // waitForLock guarantees engine has been running since lock creation;
    // engine.start is emitted shortly after, before runTriage is invoked.
    await waitForLock(lockPath, 30_000);
    await waitForLogEvent(logPath, "engine.start", 30_000);

    let exitCode: number | null = null;
    child.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((r) => child.on("exit", (code) => { exitCode = code; r(); })),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("child did not exit after SIGTERM (idle)")), 10_000),
      ),
    ]);

    assert.strictEqual(exitCode, 143, "should exit 143 on SIGTERM");

    const rawLog = await readFile(join(root, ".cycle", "log.jsonl"), "utf8");
    const events = rawLog.split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const killed = events.filter((e: { event: string }) => e.event === "cycle.killed");
    assert.strictEqual(killed.length, 1, "exactly one cycle.killed event");
    assert.ok(typeof killed[0].ts === "string", "ts is a string");
    assert.strictEqual(killed[0].cycle_id, undefined, "cycle_id undefined when no cycle was in progress");
  } finally {
    child?.kill();
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    await rm(fakeBinDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});
