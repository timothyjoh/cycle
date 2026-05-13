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

// Halt-on-failure policy: during dogfood + early use, each cycle failure
// is a real bug worth eyes on before the queue advances. We do NOT
// continue past a failed cycle. The remaining queue stays in tbd.jsonl /
// queued/ for the next invocation to pick up after the human fixes the
// root cause and re-cycles the failed issue.
let cyclesProcessed = 0;
let halted: { issueId: string; failingStep: string | undefined } | null = null;

outer: while (true) {
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
      await log.emit("issue.failed", { issue_id: issue.id, failing_step: r.failingStep });
      halted = { issueId: issue.id, failingStep: r.failingStep };
      break outer;
    }
  }
}

await log.emit("engine.stop", {
  status: args.dryRun ? "ok" : halted ? "halted" : "ok",
  dry_run: args.dryRun,
  cycles_processed: cyclesProcessed,
  ...(halted ? { halted_at_issue: halted.issueId, failing_step: halted.failingStep } : {}),
});
process.exit(halted ? 1 : 0);
