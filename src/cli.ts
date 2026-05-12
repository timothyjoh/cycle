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

const args = parseArgs(argv);
const cwd = process.cwd();

const log = await createLogger(cwd);
await log.emit("engine.start", {});

const { id } = await materializeFreeformIssue(args.text, cwd);
const ingested = await scanTbd(cwd);
const issue = ingested.find(i => i.id === id);
if (!issue) throw new Error("freshly materialized issue not picked up by scan");
await log.emit("issue.ingested", { issue_id: issue.id, path: issue.path });

if (args.dryRun) {
  await log.emit("engine.stop", { status: "ok", dry_run: true });
  process.exit(0);
}

const r = await runCycle(cwd, { issueId: issue.id, title: issue.title, workflow: args.workflow });
await log.emit("engine.stop", { status: r.status });
process.exit(r.status === "ok" ? 0 : 1);
