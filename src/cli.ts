import { appendFileSync } from "node:fs";
import { readFile, readdir, rename, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { buildChildEnv } from "./engine/child-env.ts";
import { getVersion } from "./version.ts";
import { parseArgs } from "./cli/parse-args.ts";
import { materializeFreeformIssue } from "./issue/materialize.ts";
import { runTriage } from "./engine/triage.ts";
import { createLogger } from "./engine/log.ts";
import { allocateCycleId } from "./engine/cycle-id.ts";
import {
  popNextPending,
  markInProgress,
  drainOk,
  drainFailedRetry,
  readQueue,
} from "./engine/queue.ts";
import { loadConfig } from "./engine/workflow.ts";
import type { CycleConfig } from "./engine/workflow.ts";
import { parseFrontmatter } from "./engine/frontmatter.ts";
import { readLogTail } from "./engine/log-tail.ts";
import type { InFlightCycle } from "./engine/log-tail.ts";
import { checkoutBase, pullBase, resolveBaseBranch } from "./engine/branch.ts";
import { commitCycle } from "./engine/commit-cycle.ts";
import { terminalDrain } from "./engine/issue-lifecycle.ts";
import { readCycleEndFailure, advanceFastFailCounter } from "./engine/iteration-guard.ts";
import { recordTerminalFailure, type HaltContext } from "./engine/halt-accounting.ts";
import { emitStaleDistWarning } from "./engine/stale-dist.ts";
import { acquireLock, releaseLock } from "./engine/engine-lock.ts";
import { loadDotEnv } from "./engine/dot-env.ts";
import { slugify } from "./issue/id.ts";
import type { Logger } from "./engine/log.ts";
import type { RunArgs } from "./cli/parse-args.ts";

type ResumeOutcome = "ok" | "retry" | "terminal" | "skipped";
type ResumeResult = {
  processed: number;
  outcome: ResumeOutcome;
  issueId?: string;
  failingStep?: string;
};

const processStart = Date.now();
const argv = process.argv.slice(2);
if (argv[0] === "--version") {
  console.log(await getVersion());
  process.exit(0);
}

if (argv[0] === "init") {
  const { runInit } = await import("./cli/init.ts");
  const force = argv.includes("--force");
  await runInit({ targetRoot: process.cwd(), force });
  process.exit(0);
}

if (argv[0] === "upgrade") {
  const { runUpgrade } = await import("./cli/upgrade.ts");
  const result = await runUpgrade({ targetRoot: process.cwd(), argv: argv.slice(1) });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr + String.fromCharCode(10));
  process.exit(result.exitCode);
}

if (argv[0] === "status") {
  const { runStatus } = await import("./cli/status.ts");
  const out = await runStatus({ cwd: process.cwd() });
  console.log(out);
  process.exit(0);
}

if (argv[0] === "triage") {
  const { runCliTriage } = await import("./cli/triage.ts");
  const result = await runCliTriage(process.cwd(), argv.slice(1));
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr + "\n");
  process.exit(result.exitCode);
}

if (argv[0] === "run-one") {
  const { runOne } = await import("./cli/run-one.ts");
  await runOne(argv.slice(1), process.cwd());
  // runOne always calls process.exit(); this line is unreachable
}


if (argv[0] === "cleanup") {
  const { runCliCleanup } = await import("./cli/cleanup.ts");
  const result = await runCliCleanup(process.cwd(), argv.slice(1));
  if (result.stdout) process.stdout.write(result.stdout + String.fromCharCode(10));
  if (result.stderr) process.stderr.write(result.stderr + String.fromCharCode(10));
  process.exit(result.exitCode);
}

if (argv[0] === "compress-output") {
  const { runCompressOutput } = await import("./cli/compress-output.ts");
  const result = runCompressOutput(argv.slice(1));
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.exitCode);
}

if (argv[0] === "compress-output-hook") {
  const { runCompressOutputHook } = await import("./cli/compress-output-hook.ts");
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  const result = runCompressOutputHook(Buffer.concat(chunks).toString("utf8"), {
    execPath: process.execPath,
    cliPath: process.argv[1],
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr + "\n");
  process.exit(result.exitCode);
}

if (argv[0] === "help" || argv[0] === "--help" || argv.includes("--help")) {
  console.log(`cycle — issue-driven workflow engine for autonomous code changes

Usage:
  cycle [run] [<task>] [flags]  Triage and run the queue (optionally add a freeform task first)
  cycle drop <task>             Add a freeform task to the inbox without running
  cycle status                  Print queue counts and in-flight state
  cycle triage [--dry-run]      Re-run triage diagnostics
  cycle cleanup [--dry-run] [--yes] [--force]
                                List or delete orphaned cycle/* branches
  cycle compress-output -- <cmd>   Run <cmd> and density-filter its stdout (token saver)
  cycle upgrade [--overwrite-prompts] [--overwrite-workflows]
                [--overwrite-scripts] [--overwrite-all]
                                Refresh engine bundle in place; preserve user config by default
  cycle help                    Show this help

Flags for run:
  --workflow <name>             Force a workflow (default: feature)
  --dry-run                     Preview triage/queue; no execution
  --no-skip-completed           Re-derive pre-build artifacts on retry
  --trunk                       Commit to base branch instead of per-cycle branches

  --version                     Print version and exit
  --help                        Show this help`);
  process.exit(0);
}

const args = parseArgs(argv);
const cwd = process.cwd();

if (args.command === "drop") {
  const { id, path } = await materializeFreeformIssue(args.text, cwd, new Date());
  console.log(JSON.stringify({ event: "issue.dropped", issue_id: id, path }));
  process.exit(0);
}

if (args.text) {
  await materializeFreeformIssue(args.text, cwd);
}

if (args.dryRun) {
  const rows = await readQueue(cwd);
  for (const row of rows) {
    if (row.status !== "pending") continue;
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      event: "issue.ingested",
      issue_id: row.id,
      path: join(cwd, "docs/cycle/issues/todo", `${row.id}.md`),
    }));
  }
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    event: "engine.stop",
    status: "ok",
    dry_run: true,
    cycles_processed: 0,
  }));
  process.exit(0);
}

const lockPath = join(cwd, ".cycle", "engine.lock");
try {
  acquireLock(lockPath);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
process.on("exit", () => releaseLock(lockPath));
process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));

const log = await createLogger(cwd);
const logPath = join(cwd, ".cycle", "log.jsonl");
let activeCycleId: string | undefined;
process.prependListener("SIGTERM", () => {
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), event: "cycle.killed", cycle_id: activeCycleId });
    appendFileSync(logPath, line + "\n", "utf8");
  } catch {
    // write failure must not prevent exit
  }
  process.exit(143);
});

const todoDir = join(cwd, "docs/cycle/issues/todo");
const doneDir = join(cwd, "docs/cycle/issues/done");
const failedDir = join(cwd, "docs/cycle/issues/failed");
const rawDir = join(cwd, "docs/cycle/issues/inbox");
await mkdir(doneDir, { recursive: true });
await mkdir(failedDir, { recursive: true });

if (args.trunk) process.env.CYCLE_TRUNK_BASED = "1";
loadDotEnv(join(cwd, ".cycle", ".env"));
const cfg = await loadConfig(cwd);

const skipCompletedOnRetry =
  args.noSkipCompleted ? false : (cfg?.engine?.skip_completed_on_retry ?? true);

await emitStaleDistWarning(log, processStart, cwd);
await log.emit("engine.start", { skip_completed_on_retry: skipCompletedOnRetry });

if (cfg) {
  const triageResult = await runTriage(cwd, cfg, log);
  if (triageResult.status === "paused") {
    await log.emit("engine.stop", {
      status: "halted",
      dry_run: false,
      cycles_processed: 0,
      reason: "triage_failed",
    });
    process.exit(1);
  }
}

async function rawHasFiles(): Promise<boolean> {
  try {
    const entries = await readdir(rawDir);
    return entries.some((f) => f.endsWith(".md"));
  } catch {
    return false;
  }
}

let cyclesProcessed = 0;
let consecutiveFailures = 0;
let failedCycles: string[] = [];
let halted = false;
let haltReason: "max_consecutive_failures" | "triage_failed" | null = null;
let lastHaltContext: HaltContext | undefined;
const maxConsecutiveFailures = cfg?.engine?.max_consecutive_failures ?? 2;

// Iteration-too-fast guard: after ITERATION_TOO_FAST_K consecutive failures of
// the same step, each completing in under engine.min_step_duration_ms wall-clock,
// the supervisor fast-bails the cycle to terminalDrain instead of burning the
// remaining attempt budget on a tight instant-failure loop. Counter is keyed by
// `${cycleId}::${failingStep}` and persists across an issue's retries in this
// single long-running process (like consecutiveFailures).
const ITERATION_TOO_FAST_K = 2;
let fastFailKey: string | null = null;
let fastFailCount = 0;

async function drainSuccess(
  cwd: string,
  log: Logger,
  todoPath: string,
  doneDir: string,
  cycleId: string,
  issueId: string,
): Promise<void> {
  await drainOk(cwd, issueId);
  try {
    await rename(todoPath, join(doneDir, `${issueId}.md`));
  } catch {
    // file may already have been moved by the workflow itself; tolerate
  }
  await log.emit("queue.drained", { cycle_id: cycleId, issue_id: issueId, outcome: "ok" });
}

async function drainRetry(
  cwd: string,
  log: Logger,
  cycleId: string,
  issueId: string,
  failingStep: string | undefined,
): Promise<void> {
  await drainFailedRetry(cwd, issueId);
  await log.emit("queue.drained", { cycle_id: cycleId, issue_id: issueId, outcome: "retry" });
  await log.emit("issue.failed", { issue_id: issueId, failing_step: failingStep });
}

type RunOneParams = {
  cycleId: string;
  issueId: string;
  title: string;
  workflow: string;
  attempt: number;
  skipCompletedOnRetry: boolean;
  baseBranch?: string;
  resumeFromStep?: number;
};

function spawnRunOne(params: RunOneParams): Promise<number> {
  const args: string[] = [
    "--cycle-id", params.cycleId,
    "--issue-id", params.issueId,
    "--title", params.title,
    "--workflow", params.workflow,
    "--attempt", String(params.attempt),
  ];
  if (params.skipCompletedOnRetry) args.push("--skip-completed-on-retry");
  if (params.baseBranch !== undefined) args.push("--base-branch", params.baseBranch);
  if (params.resumeFromStep !== undefined)
    args.push("--resume-from-step", String(params.resumeFromStep));

  // buildChildEnv strips all CYCLE_* vars; CYCLE_TRUNK_BASED must be re-injected
  // because the run-one child's loadConfig reads it to force trunk mode. Without
  // this, --trunk and .cycle/.env silently fail to reach the child and every
  // cycle falls back to the worktree-pr default.
  const extra: Record<string, string> = process.env.CYCLE_TRUNK_BASED === "1" ? { CYCLE_TRUNK_BASED: "1" } : {};
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [process.argv[1], "run-one", ...args],
      { env: buildChildEnv(extra), stdio: "inherit", shell: false },
    );
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", reject);
  });
}

async function runResumeOnce(
  cwd: string,
  log: Logger,
  cfg: CycleConfig,
  args: RunArgs,
  tail: InFlightCycle,
  todoDir: string,
  doneDir: string,
  failedDir: string,
): Promise<ResumeResult> {
  let fmBaseBranch: string | undefined;
  try {
    const body = await readFile(join(todoDir, `${tail.issueId}.md`), "utf8");
    const { fm } = parseFrontmatter(body);
    fmBaseBranch = typeof fm.base_branch === "string" && fm.base_branch.length > 0
      ? fm.base_branch : undefined;
  } catch { /* fall back to config */ }
  const base = process.env.CYCLE_BASE ?? resolveBaseBranch(cfg.engine.base_branch, fmBaseBranch);
  let baseOk = true;
  try {
    await checkoutBase(cwd, base);
    await pullBase(cwd, base);
  } catch (err) {
    baseOk = false;
    await log.emit("engine.warning", {
      reason: "resume_base_refresh_failed",
      message: (err as Error).message,
    });
  }

  const rows = await readQueue(cwd);
  const row = rows.find((r) => r.id === tail.issueId);
  const mismatch =
    !row ||
    row.status !== "in_progress" ||
    (row.cycle_id !== undefined && row.cycle_id !== tail.cycleId);

  if (mismatch) {
    await log.emit("engine.warning", {
      reason: "resume_row_mismatch",
      cycle_id: tail.cycleId,
      issue_id: tail.issueId,
      row_status: row?.status ?? "missing",
      row_cycle_id: row?.cycle_id ?? null,
    });
    return { processed: 0, outcome: "skipped" };
  }

  if (!baseOk) return { processed: 0, outcome: "skipped" };

  let workflowName = tail.workflow || args.workflow;
  try {
    const body = await readFile(join(todoDir, `${tail.issueId}.md`), "utf8");
    const { fm } = parseFrontmatter(body);
    if (typeof fm.workflow === "string" && fm.workflow.length > 0) {
      workflowName = fm.workflow;
    }
  } catch {
    // fall back to tail.workflow / args.workflow
  }

  const wfDef = cfg.workflows.find((w) => w.name === workflowName);
  if (!wfDef) {
    await log.emit("engine.warning", {
      reason: "resume_workflow_missing",
      workflow: workflowName,
    });
    return { processed: 0, outcome: "skipped" };
  }

  const stepNames = wfDef.steps.map((s) => s.name);
  let startStepIndex = stepNames.length;
  for (let i = 0; i < stepNames.length; i++) {
    if (!tail.completedSteps.includes(stepNames[i])) {
      startStepIndex = i;
      break;
    }
  }

  await markInProgress(cwd, tail.issueId, tail.cycleId);
  await log.emit("engine.resume", {
    cycle_id: tail.cycleId,
    issue_id: tail.issueId,
    from_step: stepNames[startStepIndex] ?? null,
    completed_steps: tail.completedSteps,
  });

  const rawMax = wfDef.max_cycle_attempts ?? 3;
  const maxAttempts = rawMax < 1 ? 1 : rawMax;

  const exitCode = await spawnRunOne({
    cycleId: tail.cycleId,
    issueId: tail.issueId,
    title: tail.title,
    workflow: workflowName,
    attempt: row!.attempt,
    skipCompletedOnRetry,
    resumeFromStep: startStepIndex,
  });
  const failingStep = exitCode !== 0
    ? (await readCycleEndFailure(cwd, tail.cycleId)).failingStep
    : undefined;

  const todoPath = join(todoDir, `${tail.issueId}.md`);
  if (exitCode === 0) {
    const artifactDir = join(cwd, "docs", "cycle", `${tail.cycleId}-${workflowName}-${slugify(tail.title)}`);
    const cr = await commitCycle(cwd, {
      cycleId: tail.cycleId,
      title: tail.title,
      issueId: tail.issueId,
      config: cfg.engine.commit,
      baseBranch: cfg.engine.base_branch,
      log,
      artifactDir,
    });
    if (cr.status === "failed") {
      if (row!.attempt + 1 < maxAttempts) {
        await drainRetry(cwd, log, tail.cycleId, tail.issueId, "commit");
        return { processed: 0, outcome: "retry", issueId: tail.issueId, failingStep: "commit" };
      }
      await terminalDrain(cwd, log, todoPath, failedDir, tail.cycleId, tail.issueId, "commit", row!.attempt + 1);
      return { processed: 0, outcome: "terminal", issueId: tail.issueId, failingStep: "commit" };
    }
    await drainSuccess(cwd, log, todoPath, doneDir, tail.cycleId, tail.issueId);
    return { processed: 1, outcome: "ok" };
  }
  if (row!.attempt + 1 < maxAttempts) {
    await drainRetry(cwd, log, tail.cycleId, tail.issueId, failingStep);
    return { processed: 0, outcome: "retry", issueId: tail.issueId, failingStep };
  }
  await terminalDrain(cwd, log, todoPath, failedDir, tail.cycleId, tail.issueId, failingStep, row!.attempt + 1);
  return { processed: 0, outcome: "terminal", issueId: tail.issueId, failingStep };
}

if (cfg) {
  const tail = await readLogTail(cwd);
  if (tail) {
    activeCycleId = tail.cycleId;
    const result = await runResumeOnce(cwd, log, cfg, args, tail, todoDir, doneDir, failedDir);
    cyclesProcessed += result.processed;
    if (result.outcome === "ok") {
      consecutiveFailures = 0;
      failedCycles = [];
      lastHaltContext = undefined;
    } else if (result.outcome === "terminal") {
      consecutiveFailures += 1;
      failedCycles.push(tail.cycleId);
      lastHaltContext = { issueId: result.issueId!, failingStep: result.failingStep };
      if (consecutiveFailures >= maxConsecutiveFailures) {
        halted = true;
        haltReason = "max_consecutive_failures";
      }
    }
    activeCycleId = undefined;
  }
}


while (!halted) {
  if (cfg && (await rawHasFiles())) {
    const r = await runTriage(cwd, cfg, log);
    if (r.status === "paused") {
      halted = true;
      haltReason = "triage_failed";
      lastHaltContext = { issueId: "", failingStep: "triage" };
      break;
    }
  }

  const row = await popNextPending(cwd);
  if (!row) break;

  const todoPath = join(todoDir, `${row.id}.md`);
  const cycleId = row.cycle_id ?? (await allocateCycleId(cwd));
  activeCycleId = cycleId;
  await log.emit("issue.ingested", { issue_id: row.id, path: todoPath });

  let workflowName = args.workflow;
  let fmBaseBranch: string | undefined;
  try {
    const body = await readFile(todoPath, "utf8");
    const { fm } = parseFrontmatter(body);
    if (typeof fm.workflow === "string" && fm.workflow.length > 0) {
      workflowName = fm.workflow;
    }
    if (typeof fm.base_branch === "string" && fm.base_branch.length > 0) {
      fmBaseBranch = fm.base_branch;
    }
  } catch {
    // todo file missing or unparseable — fall back to CLI default
  }

  const wfCfg = cfg?.workflows.find((w) => w.name === workflowName);
  const rawMax = wfCfg?.max_cycle_attempts ?? 3;
  const maxAttempts = rawMax < 1 ? 1 : rawMax;

  await markInProgress(cwd, row.id, cycleId);

  const exitCode = await spawnRunOne({
    cycleId,
    issueId: row.id,
    title: row.title,
    workflow: workflowName,
    attempt: row.attempt,
    skipCompletedOnRetry,
    baseBranch: fmBaseBranch,
  });
  const failure = exitCode !== 0
    ? await readCycleEndFailure(cwd, cycleId)
    : { failingStep: undefined, durationMs: undefined };
  const failingStep = failure.failingStep;

  // Resolve the iteration-too-fast threshold at the read site (never crash on a
  // bad config value): a non-finite or non-positive min_step_duration_ms disables
  // the guard entirely, matching the SPEC's 0/absent/malformed semantics.
  const rawMin = cfg?.engine?.min_step_duration_ms;
  const thresholdMs =
    typeof rawMin === "number" && Number.isFinite(rawMin) && rawMin > 0 ? rawMin : 0;
  const guardEnabled = thresholdMs > 0;

  if (exitCode === 0) {
    const artifactDir = join(cwd, "docs", "cycle", `${cycleId}-${workflowName}-${slugify(row.title)}`);
    const cr = await commitCycle(cwd, {
      cycleId,
      title: row.title,
      issueId: row.id,
      config: cfg!.engine.commit,
      baseBranch: cfg!.engine.base_branch,
      log,
      artifactDir,
    });
    if (cr.status === "failed") {
      if (row.attempt + 1 < maxAttempts) {
        await drainRetry(cwd, log, cycleId, row.id, "commit");
      } else {
        await terminalDrain(cwd, log, todoPath, failedDir, cycleId, row.id, "commit", row.attempt + 1);
        const acct = recordTerminalFailure(
          { consecutiveFailures, failedCycles },
          { cycleId, issueId: row.id, failingStep: "commit", maxConsecutiveFailures },
        );
        consecutiveFailures = acct.consecutiveFailures;
        failedCycles = acct.failedCycles;
        lastHaltContext = acct.lastHaltContext;
        fastFailKey = acct.fastFail.key;
        fastFailCount = acct.fastFail.count;
        if (acct.halt) {
          halted = true;
          haltReason = "max_consecutive_failures";
          activeCycleId = undefined;
          break;
        }
      }
    } else {
      await drainSuccess(cwd, log, todoPath, doneDir, cycleId, row.id);
      cyclesProcessed++;
      consecutiveFailures = 0;
      failedCycles = [];
      lastHaltContext = undefined;
      fastFailKey = null;
      fastFailCount = 0;
    }
  } else {
    // exec failure (exitCode !== 0). Track consecutive sub-threshold failures of
    // the same step; after ITERATION_TOO_FAST_K of them, fast-bail to terminal.
    const key = `${cycleId}::${failingStep ?? ""}`;
    const advanced = advanceFastFailCounter(
      { key: fastFailKey, count: fastFailCount },
      {
        key,
        guardEnabled,
        failingStep,
        durationMs: failure.durationMs,
        thresholdMs,
        k: ITERATION_TOO_FAST_K,
      },
    );
    fastFailKey = advanced.state.key;
    fastFailCount = advanced.state.count;
    const fastBail = advanced.fastBail;

    if (fastBail) {
      await log.emit("step.warning", {
        cycle_id: cycleId,
        step: failingStep,
        reason: "iteration_too_fast",
        duration_ms: failure.durationMs,
        threshold_ms: thresholdMs,
      });
      await terminalDrain(cwd, log, todoPath, failedDir, cycleId, row.id, failingStep, row.attempt + 1);
      const acct = recordTerminalFailure(
        { consecutiveFailures, failedCycles },
        { cycleId, issueId: row.id, failingStep, maxConsecutiveFailures },
      );
      consecutiveFailures = acct.consecutiveFailures;
      failedCycles = acct.failedCycles;
      lastHaltContext = acct.lastHaltContext;
      fastFailKey = acct.fastFail.key;
      fastFailCount = acct.fastFail.count;
      if (acct.halt) {
        halted = true;
        haltReason = "max_consecutive_failures";
        activeCycleId = undefined;
        break;
      }
    } else if (row.attempt + 1 < maxAttempts) {
      await drainRetry(cwd, log, cycleId, row.id, failingStep);
      // retry-drain: counter unchanged; popNextPending will see the row again with attempt++.
    } else {
      await terminalDrain(cwd, log, todoPath, failedDir, cycleId, row.id, failingStep, row.attempt + 1);
      const acct = recordTerminalFailure(
        { consecutiveFailures, failedCycles },
        { cycleId, issueId: row.id, failingStep, maxConsecutiveFailures },
      );
      consecutiveFailures = acct.consecutiveFailures;
      failedCycles = acct.failedCycles;
      lastHaltContext = acct.lastHaltContext;
      fastFailKey = acct.fastFail.key;
      fastFailCount = acct.fastFail.count;
      if (acct.halt) {
        halted = true;
        haltReason = "max_consecutive_failures";
        activeCycleId = undefined;
        break;
      }
    }
  }
  activeCycleId = undefined;
}

if (halted && haltReason === "max_consecutive_failures" && failedCycles.length > 0) {
  await log.emit("engine.halted", {
    failed_cycles: failedCycles,
    reason: "max_consecutive_failures",
    threshold: maxConsecutiveFailures,
  });
}

await log.emit("engine.stop", {
  status: halted ? "halted" : "ok",
  dry_run: false,
  cycles_processed: cyclesProcessed,
  ...(halted && haltReason === "triage_failed" ? { reason: "triage_failed" } : {}),
  ...(halted && lastHaltContext
    ? { halted_at_issue: lastHaltContext.issueId, failing_step: lastHaltContext.failingStep }
    : {}),
});
process.exit(halted ? 1 : 0);
