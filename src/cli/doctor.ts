import { loadConfig } from "../engine/workflow.ts";
import { runPreflight, type PreflightResult } from "../engine/preflight.ts";
import { validateWorkflowName } from "./validate-workflow.ts";

export type DoctorResult = { stdout: string; stderr: string; exitCode: number };

export type DoctorOpts = {
  cwd: string;
  /**
   * Resolved workflow name. `undefined` ⇒ no `--workflow` flag was given and the
   * command defaults to `feature` (no validation rejection possible). An explicit
   * string (including `""`, the value-less-flag signal) is user-supplied and is
   * validated against the loaded config's workflow set before any probing runs.
   */
  workflow?: string;
  /** Override env for CYCLE_<AGENT>_BIN resolution; defaults to process.env. */
  env?: Record<string, string | undefined>;
};

/**
 * Pure renderer over a {@link PreflightResult}. Lists every check (agents then
 * tools, in `runPreflight` emission order) with a pass/fail marker and resolved
 * path, then every warning, then — when `!result.ok` — a per-failure remediation
 * footer and a summary line. No probing logic is duplicated here; this is purely
 * a view over the value `runPreflight` already computed.
 */
export function renderReport(result: PreflightResult): string {
  const lines: string[] = [];
  const nameWidth = Math.max(10, ...result.checks.map((c) => c.name.length), 0);
  for (const c of result.checks) {
    const status = c.ok ? "ok" : "FAIL";
    const tail = c.resolvedPath ?? "";
    lines.push(
      `${c.kind.padEnd(6)} ${c.name.padEnd(nameWidth)} ${status.padEnd(4)} ${tail}`.trimEnd(),
    );
  }
  for (const w of result.warnings) {
    lines.push(`warn   ${w.target.padEnd(nameWidth)} ${w.message}`.trimEnd());
  }
  if (!result.ok) {
    lines.push("");
    for (const f of result.failures) {
      lines.push(`FAIL ${f.name}: ${f.fix}`);
    }
    lines.push(`doctor: ${result.failures.length} check(s) failed`);
  } else {
    lines.push("doctor: all checks passed");
  }
  return lines.join("\n") + "\n";
}

/**
 * Read-only on-demand environment check. Loads the repo config, validates the
 * resolved workflow name against the config's workflow set, runs the existing
 * engine-start `runPreflight` against the selected workflow, and renders the
 * result as a human-readable report. Acquires no lock and mutates no state.
 * Returns exit 0 on a clean pass (warnings present or not), non-zero when any
 * check fails, the config cannot be loaded, or an explicit `--workflow` value is
 * unknown or value-less. A no-arg invocation (`workflow === undefined`) defaults
 * to `feature` and is never rejected. Validation runs after config-load and
 * before any probing, so a rejected workflow spawns no probe. Never throws.
 */
export async function runDoctor({ cwd, workflow, env }: DoctorOpts): Promise<DoctorResult> {
  const sourceEnv = env ?? process.env;
  let cfg;
  try {
    cfg = await loadConfig(cwd, sourceEnv);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      stdout: "",
      stderr: `doctor: could not load config — ${msg}\nRun \`cycle init\` first if this repo is not initialized.`,
      exitCode: 1,
    };
  }

  // `undefined` ⇒ no `--workflow` flag ⇒ default. An explicit value (including
  // `""`, the value-less-flag signal) is user-supplied and must validate against
  // the config set before any probe runs. Shared with the `cycle run` start path
  // via the single `validateWorkflowName` helper so the two cannot drift.
  const v = validateWorkflowName(workflow, cfg.workflows.map((w) => w.name), "doctor");
  if (!v.ok) return { stdout: "", stderr: v.message, exitCode: 1 };
  const effective = v.name;

  const result = runPreflight({ cfg, workflowName: effective, env: sourceEnv });
  return { stdout: renderReport(result), stderr: "", exitCode: result.ok ? 0 : 1 };
}
