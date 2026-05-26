import { loadConfig } from "../engine/workflow.ts";
import { dryRunTriage, type TriageDeps } from "../engine/triage.ts";

const HELP = `Usage: cycle triage --dry-run [--help]

Re-run the configured triage agent against every file in
docs/cycle/issues/inbox/ and print a per-raw report as JSON.

The --dry-run mode performs no engine-side filesystem mutations:
  - no writes under docs/cycle/issues/{raw,todo,done,failed}
  - no appends/rewrites to .cycle/tbd.jsonl
  - no writes to .cycle/log.jsonl

The triage agent itself is still invoked, so the agent binary's own
behavior is out of scope of this guarantee.

Exits 0 if every raw passed validation, 1 otherwise.

Note: cycle triage without --dry-run is not implemented; real triage
runs as part of \`cycle run\`.`;

export async function runCliTriageWithDeps(
  repoRoot: string,
  argv: string[],
  deps: TriageDeps,
): Promise<{ exitCode: number; stdout: string; stderr?: string }> {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { exitCode: 0, stdout: HELP + "\n" };
  }
  if (!argv.includes("--dry-run")) {
    return { exitCode: 2, stdout: "", stderr: HELP };
  }
  const cfg = await loadConfig(repoRoot);
  const reports = await dryRunTriage(repoRoot, cfg, deps);
  const anyFailed = reports.some((r) => r.status === "failed");
  return {
    exitCode: anyFailed ? 1 : 0,
    stdout: JSON.stringify(reports, null, 2) + "\n",
  };
}

export async function runCliTriage(
  repoRoot: string,
  argv: string[],
): Promise<{ exitCode: number; stdout: string; stderr?: string }> {
  return runCliTriageWithDeps(repoRoot, argv, {});
}
