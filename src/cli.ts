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
import { parseFrontmatter, mutateFrontmatter } from "./engine/frontmatter.ts";
import { propagateBlocked } from "./engine/blocked.ts";

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
let halted: { issueId: string; failingStep: string | undefined } | null = null;

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

while (true) {
  if (cfg && (await rawHasFiles())) {
    const r = await runTriage(cwd, cfg, log);
    if (r.status === "paused") {
      halted = { issueId: "", failingStep: "triage" };
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
    await drainOk(cwd, row.id);
    try {
      await rename(todoPath, join(doneDir, `${row.id}.md`));
    } catch {
      // file may already have been moved by the workflow itself; tolerate
    }
    await log.emit("queue.drained", { cycle_id: cycleId, issue_id: row.id, outcome: "ok" });
    cyclesProcessed++;
  } else if (row.attempt + 1 < maxAttempts) {
    await drainFailedRetry(cwd, row.id);
    await log.emit("queue.drained", { cycle_id: cycleId, issue_id: row.id, outcome: "retry" });
    await log.emit("issue.failed", { issue_id: row.id, failing_step: r.failingStep });
    halted = { issueId: row.id, failingStep: r.failingStep };
    break;
  } else {
    const failedAttempts = row.attempt + 1;
    let mutateErr: Error | null = null;
    try {
      await mutateFrontmatter(todoPath, (fm) => ({
        ...fm,
        failed_at: new Date().toISOString(),
        failed_step: r.failingStep,
        failed_attempts: failedAttempts,
      }));
    } catch (e) {
      mutateErr = e as Error;
    }
    try {
      await rename(todoPath, join(failedDir, `${row.id}.md`));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    if (mutateErr) {
      await log.emit("queue.drain_warning", {
        cycle_id: cycleId,
        issue_id: row.id,
        reason: `mutateFrontmatter failed: ${mutateErr.message}`,
      });
    }
    await drainFailedTerminal(cwd, row.id);
    await propagateBlocked(cwd, row.id, log);
    await log.emit("queue.drained", { cycle_id: cycleId, issue_id: row.id, outcome: "terminal" });
    await log.emit("issue.failed", { issue_id: row.id, failing_step: r.failingStep });
    halted = { issueId: row.id, failingStep: r.failingStep };
    break;
  }
}

await log.emit("engine.stop", {
  status: args.dryRun ? "ok" : halted ? "halted" : "ok",
  dry_run: args.dryRun,
  cycles_processed: cyclesProcessed,
  ...(halted ? { halted_at_issue: halted.issueId, failing_step: halted.failingStep } : {}),
});
process.exit(halted ? 1 : 0);
