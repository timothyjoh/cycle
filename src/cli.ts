import { readFile, readdir, rename, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getVersion } from "./version.ts";
import { parseArgs } from "./cli/parse-args.ts";
import { materializeFreeformIssue } from "./issue/materialize.ts";
import { runTriage } from "./engine/triage.ts";
import { createLogger } from "./engine/log.ts";
import { runCycle } from "./engine/run-cycle.ts";
import { allocateCycleId } from "./engine/cycle-id.ts";
import {
  popNextPending,
  markInProgress,
  drainOk,
  drainFailedRetry,
  drainFailedTerminal,
  readQueue,
} from "./engine/queue.ts";
import { loadConfig } from "./engine/workflow.ts";
import type { CycleConfig } from "./engine/workflow.ts";
import { parseFrontmatter, mutateFrontmatter } from "./engine/frontmatter.ts";
import { propagateBlocked } from "./engine/blocked.ts";
import { readLogTail } from "./engine/log-tail.ts";
import type { InFlightCycle } from "./engine/log-tail.ts";
import { checkoutBase, pullBase } from "./engine/branch.ts";
import type { Logger } from "./engine/log.ts";
import type { RunArgs } from "./cli/parse-args.ts";

type HaltContext = { issueId: string; failingStep: string | undefined };
type ResumeOutcome = "ok" | "retry" | "terminal" | "skipped";
type ResumeResult = {
  processed: number;
  outcome: ResumeOutcome;
  issueId?: string;
  failingStep?: string;
};

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

const args = parseArgs(argv);
const cwd = process.cwd();

if (args.command === "drop") {
  const { id, path } = await materializeFreeformIssue(args.text, cwd);
  console.log(JSON.stringify({ event: "issue.dropped", issue_id: id, path }));
  process.exit(0);
}

const log = await createLogger(cwd);
await log.emit("engine.start", {});

if (args.text) {
  await materializeFreeformIssue(args.text, cwd);
}

const todoDir = join(cwd, "docs/cycle/issues/todo");
const doneDir = join(cwd, "docs/cycle/issues/done");
const failedDir = join(cwd, "docs/cycle/issues/failed");
const rawDir = join(cwd, "docs/cycle/issues/raw");
await mkdir(doneDir, { recursive: true });
await mkdir(failedDir, { recursive: true });

const cfg = args.dryRun ? null : await loadConfig(cwd);

if (!args.dryRun && cfg) {
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

async function terminalDrain(
  cwd: string,
  log: Logger,
  todoPath: string,
  failedDir: string,
  cycleId: string,
  issueId: string,
  failingStep: string | undefined,
  failedAttempts: number,
): Promise<void> {
  let mutateErr: Error | null = null;
  try {
    await mutateFrontmatter(todoPath, (fm) => ({
      ...fm,
      failed_at: new Date().toISOString(),
      ...(failingStep ? { failed_step: failingStep } : {}),
      failed_attempts: failedAttempts,
    }));
  } catch (e) {
    mutateErr = e as Error;
  }
  try {
    await rename(todoPath, join(failedDir, `${issueId}.md`));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  if (mutateErr) {
    await log.emit("queue.drain_warning", {
      cycle_id: cycleId,
      issue_id: issueId,
      reason: `mutateFrontmatter failed: ${mutateErr.message}`,
    });
  }
  await drainFailedTerminal(cwd, issueId);
  await propagateBlocked(cwd, issueId, log);
  await log.emit("queue.drained", { cycle_id: cycleId, issue_id: issueId, outcome: "terminal" });
  await log.emit("issue.failed", { issue_id: issueId, failing_step: failingStep });
}

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
  const base = process.env.CYCLE_BASE ?? "main";
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

  const rr = await runCycle(cwd, {
    cycleId: tail.cycleId,
    issueId: tail.issueId,
    title: tail.title,
    workflow: workflowName,
    resume: { startStepIndex },
  });

  const todoPath = join(todoDir, `${tail.issueId}.md`);
  if (rr.status === "ok") {
    await drainSuccess(cwd, log, todoPath, doneDir, tail.cycleId, tail.issueId);
    return { processed: 1, outcome: "ok" };
  }
  if (row!.attempt + 1 < maxAttempts) {
    await drainRetry(cwd, log, tail.cycleId, tail.issueId, rr.failingStep);
    return { processed: 0, outcome: "retry", issueId: tail.issueId, failingStep: rr.failingStep };
  }
  await terminalDrain(cwd, log, todoPath, failedDir, tail.cycleId, tail.issueId, rr.failingStep, row!.attempt + 1);
  return { processed: 0, outcome: "terminal", issueId: tail.issueId, failingStep: rr.failingStep };
}

if (!args.dryRun && cfg) {
  const tail = await readLogTail(cwd);
  if (tail) {
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
  }
}

if (args.dryRun) {
  const rows = await readQueue(cwd);
  for (const row of rows) {
    if (row.status !== "pending") continue;
    const todoPath = join(todoDir, `${row.id}.md`);
    await log.emit("issue.ingested", { issue_id: row.id, path: todoPath });
  }
  await log.emit("engine.stop", {
    status: "ok",
    dry_run: true,
    cycles_processed: 0,
  });
  process.exit(0);
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
  await log.emit("issue.ingested", { issue_id: row.id, path: todoPath });

  let workflowName = args.workflow;
  try {
    const body = await readFile(todoPath, "utf8");
    const { fm } = parseFrontmatter(body);
    if (typeof fm.workflow === "string" && fm.workflow.length > 0) {
      workflowName = fm.workflow;
    }
  } catch {
    // todo file missing or unparseable — fall back to CLI default
  }

  const wfCfg = cfg?.workflows.find((w) => w.name === workflowName);
  const rawMax = wfCfg?.max_cycle_attempts ?? 3;
  const maxAttempts = rawMax < 1 ? 1 : rawMax;

  const cycleId = await allocateCycleId(cwd);
  await markInProgress(cwd, row.id, cycleId);

  const r = await runCycle(cwd, {
    cycleId,
    issueId: row.id,
    title: row.title,
    workflow: workflowName,
  });

  if (r.status === "ok") {
    await drainSuccess(cwd, log, todoPath, doneDir, cycleId, row.id);
    cyclesProcessed++;
    consecutiveFailures = 0;
    failedCycles = [];
    lastHaltContext = undefined;
  } else if (row.attempt + 1 < maxAttempts) {
    await drainRetry(cwd, log, cycleId, row.id, r.failingStep);
    // retry-drain: counter unchanged; popNextPending will see the row again with attempt++.
  } else {
    await terminalDrain(cwd, log, todoPath, failedDir, cycleId, row.id, r.failingStep, row.attempt + 1);
    consecutiveFailures += 1;
    failedCycles.push(cycleId);
    lastHaltContext = { issueId: row.id, failingStep: r.failingStep };
    if (consecutiveFailures >= maxConsecutiveFailures) {
      halted = true;
      haltReason = "max_consecutive_failures";
      break;
    }
  }
}

if (halted && haltReason === "max_consecutive_failures" && failedCycles.length > 0) {
  await log.emit("engine.halted", {
    failed_cycles: failedCycles,
    reason: "max_consecutive_failures",
    threshold: maxConsecutiveFailures,
  });
}

await log.emit("engine.stop", {
  status: args.dryRun ? "ok" : halted ? "halted" : "ok",
  dry_run: args.dryRun,
  cycles_processed: cyclesProcessed,
  ...(halted && haltReason === "triage_failed" ? { reason: "triage_failed" } : {}),
  ...(halted && lastHaltContext
    ? { halted_at_issue: lastHaltContext.issueId, failing_step: lastHaltContext.failingStep }
    : {}),
});
process.exit(halted ? 1 : 0);
