import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, mkdir, chmod, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync, spawn } from "node:child_process";

const REPO = process.cwd();

async function ensureDist(): Promise<string> {
  const distPath = join(REPO, "dist", "cycle.js");
  await readFile(distPath, "utf8");
  return distPath;
}

// A feature workflow whose single step records the worker (its parent) and its
// own (grandchild) PID, drops a WIP file, then blocks — modeling an interrupted
// mid-cycle agent step with partial work in the tree.
const sleepWorkflowYml = `engine:
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
      - name: build
        agent: bash
        command: scripts/build.sh
`;

async function bootstrapRepo(root: string): Promise<void> {
  spawnSync("git", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["config", "user.name", "t"], { cwd: root, stdio: "ignore" });
  spawnSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: root, stdio: "ignore" });

  const cycleDir = join(root, ".cycle");
  await mkdir(join(cycleDir, "scripts"), { recursive: true });
  await writeFile(join(cycleDir, "workflows.yml"), sleepWorkflowYml, "utf8");
  const buildScript = join(cycleDir, "scripts", "build.sh");
  await writeFile(
    buildScript,
    [
      "#!/bin/bash",
      'echo "work in progress" > "$WIP_OUT"',
      'echo "$PPID" > "$WORKER_PID_OUT"',
      'echo "$$" > "$GC_PID_OUT"',
      "sleep 60",
      "",
    ].join("\n"),
    "utf8",
  );
  await chmod(buildScript, 0o755);

  for (const d of ["inbox", "todo", "done", "blocked", "failed"]) {
    await mkdir(join(root, "docs/cycle/issues", d), { recursive: true });
  }
}

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

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForFile(p: string, timeoutMs = 30_000): Promise<string> {
  let waited = 0;
  while (waited < timeoutMs) {
    if (existsSync(p)) {
      const v = (await readFile(p, "utf8")).trim();
      if (v) return v;
    }
    await new Promise(r => setTimeout(r, 100));
    waited += 100;
  }
  throw new Error(`waitForFile: ${p} not present within ${timeoutMs}ms`);
}

async function waitForDead(pid: number, timeoutMs: number): Promise<void> {
  let waited = 0;
  while (waited < timeoutMs) {
    if (!isAlive(pid)) return;
    await new Promise(r => setTimeout(r, 100));
    waited += 100;
  }
  throw new Error(`waitForDead: pid ${pid} still alive after ${timeoutMs}ms`);
}

async function readEvents(logPath: string): Promise<Array<Record<string, unknown>>> {
  if (!existsSync(logPath)) return [];
  const raw = await readFile(logPath, "utf8");
  return raw.split("\n").filter(Boolean).map(l => JSON.parse(l));
}

async function waitForEvent(
  logPath: string,
  predicate: (e: Record<string, unknown>) => boolean,
  timeoutMs = 30_000,
): Promise<void> {
  let waited = 0;
  while (waited < timeoutMs) {
    if ((await readEvents(logPath)).some(predicate)) return;
    await new Promise(r => setTimeout(r, 100));
    waited += 100;
  }
  throw new Error(`waitForEvent: predicate not satisfied within ${timeoutMs}ms`);
}

test("SIGTERM reaps the worker + agent grandchild; re-run resumes the interrupted cycle with WIP intact", async () => {
  const dist = await ensureDist();
  const root = await mkdtemp(join(tmpdir(), "cycle-suspend-"));
  let child!: ReturnType<typeof spawn>;
  let rerun: ReturnType<typeof spawn> | undefined;
  try {
    await bootstrapRepo(root);

    const todoId = "suspend-resume-issue";
    await writeFile(join(root, "docs/cycle/issues/todo", `${todoId}.md`), todoFm(todoId, "suspend test"), "utf8");
    await appendFile(join(root, ".cycle/tbd.jsonl"), JSON.stringify(queueRow(todoId, "suspend test")) + "\n", "utf8");

    const wipPath = join(root, "wip.txt");
    const workerPidPath = join(root, "worker.pid");
    const gcPidPath = join(root, "grandchild.pid");
    const logPath = join(root, ".cycle", "log.jsonl");

    const childEnv = {
      ...process.env,
      WIP_OUT: wipPath,
      WORKER_PID_OUT: workerPidPath,
      GC_PID_OUT: gcPidPath,
    };

    child = spawn("node", [dist, "run", "--skip-preflight"], { cwd: root, stdio: "ignore", env: childEnv });

    // Wait until the bash grandchild has actually started and recorded both PIDs.
    const workerPid = Number(await waitForFile(workerPidPath));
    const gcPid = Number(await waitForFile(gcPidPath));
    assert.ok(Number.isInteger(workerPid) && workerPid > 0, "worker pid recorded");
    assert.ok(Number.isInteger(gcPid) && gcPid > 0, "grandchild pid recorded");
    assert.ok(isAlive(workerPid), "worker alive before signal");
    assert.ok(isAlive(gcPid), "grandchild alive before signal");

    // Capture the supervisor exit before signalling — a late listener would miss
    // an 'exit' that fires during waitForDead.
    const supervisorExit = new Promise<number | null>(r => child.on("exit", (code) => r(code)));

    // Pause: SIGTERM the supervisor.
    child.kill("SIGTERM");

    // Both the worker and its agent grandchild must die within the bounded grace
    // (supervisor grace + worker grace + margin).
    await waitForDead(workerPid, 20_000);
    await waitForDead(gcPid, 20_000);

    const exitCode = await Promise.race([
      supervisorExit,
      new Promise<number | null>((_, reject) => setTimeout(() => reject(new Error("supervisor did not exit")), 10_000)),
    ]);
    assert.strictEqual(exitCode, 143, "supervisor exits 143 on SIGTERM");

    // cycle.killed recorded; WIP preserved (never auto-discarded).
    const afterKill = await readEvents(logPath);
    assert.equal(
      afterKill.filter(e => e.event === "cycle.killed").length,
      1,
      "exactly one cycle.killed",
    );
    assert.ok(existsSync(wipPath), "WIP file preserved after the signal");

    // Resume: a fresh `cycle run` must resume the interrupted cycle (no residue
    // halt) with the WIP intact. The interrupted build step re-runs (sleep) so we
    // observe engine.resume{interrupted:true}, then stop the re-run.
    rerun = spawn("node", [dist, "run", "--skip-preflight"], { cwd: root, stdio: "ignore", env: childEnv });
    const rerunExit = new Promise<void>(r => rerun!.on("exit", () => r()));
    await waitForEvent(logPath, e => e.event === "engine.resume" && e.interrupted === true, 30_000);

    const events = await readEvents(logPath);
    const resumes = events.filter(e => e.event === "engine.resume" && e.interrupted === true);
    assert.equal(resumes.length, 1, "exactly one engine.resume{interrupted:true}");
    assert.equal(
      events.filter(e => e.event === "engine.halted" && e.reason === "failed_cycle_dirty_worktree").length,
      0,
      "no failed_cycle_dirty_worktree halt on the interrupted resume",
    );
    assert.ok(existsSync(wipPath), "WIP still present once the resume begins");

    rerun.kill("SIGTERM");
    await Promise.race([
      rerunExit,
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error("re-run did not exit")), 15_000)),
    ]);
  } finally {
    child?.kill("SIGKILL");
    rerun?.kill("SIGKILL");
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});
