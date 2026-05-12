import { getVersion } from "./version.ts";
import { parseArgs } from "./cli/parse-args.ts";
import { materializeFreeformIssue } from "./issue/materialize.ts";
import { scanTbd } from "./engine/scan.ts";
import { createLogger } from "./engine/log.ts";
import { runCycle } from "./engine/run-cycle.ts";

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

// If freeform text was supplied on this invocation, materialize it into tbd/
// before draining. Without text, drain whatever's already in tbd/.
if (args.text) {
  await materializeFreeformIssue(args.text, cwd);
}

let cyclesProcessed = 0;
let cyclesFailed = 0;
while (true) {
  const ingested = await scanTbd(cwd);
  if (ingested.length === 0) break;

  for (const issue of ingested) {
    await log.emit("issue.ingested", { issue_id: issue.id, path: issue.path });

    if (args.dryRun) {
      continue;
    }

    const r = await runCycle(cwd, {
      issueId: issue.id,
      title: issue.title,
      workflow: args.workflow,
    });
    if (r.status === "ok") {
      cyclesProcessed++;
    } else {
      cyclesFailed++;
      await log.emit("issue.failed", { issue_id: issue.id, failing_step: r.failingStep });
      // continue draining the rest of the queue (AFK-friendly)
    }
  }
}

const overall = cyclesFailed > 0 ? "partial" : "ok";
await log.emit("engine.stop", {
  status: args.dryRun ? "ok" : overall,
  dry_run: args.dryRun,
  cycles_processed: cyclesProcessed,
  cycles_failed: cyclesFailed,
});
process.exit(cyclesFailed === 0 ? 0 : 1);
