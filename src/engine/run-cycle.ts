import { allocateCycleId } from "./cycle-id.ts";
import { loadConfig } from "./workflow.ts";
import { createLogger, type Logger } from "./log.ts";
import { execBashStep, type StepResult } from "./exec-bash.ts";
import { resolveAgent, UnknownAgentError } from "./exec.ts";
import {
  createCycleBranch,
  checkoutCycleBranch,
  checkoutBase,
  pullBase,
  prepareTrunkArtifactDir,
  currentBranchName,
  revParseHead,
  resetCycleBranchTo,
  shaExists,
  resolveBaseBranch,
} from "./branch.ts";
import { ingestReflection } from "./reflection.ts";
import { sanitizeArtifactStdout } from "./sanitize-artifact.ts";
import { slugify } from "../issue/id.ts";
import { writeFile, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { truncateHeadCapped } from "./log-fmt.ts";
import { buildCompressHookSettings } from "./compress-filter.ts";
import { spawnSync } from "node:child_process";
import { isDenied } from "./path-utils.ts";

export const RESET_ELIGIBLE_STEPS = new Set(["build", "fix", "final_fix", "quick_fix", "test_fix", "test_build"]);

// SKIP_ELIGIBLE_STEPS must stay disjoint from any step that mutates the working
// tree on success — skipping such a step would lose the mutation. Pre-build
// artifact-producing steps (spec, research, plan) only write
// <artifactDir>/<STEP>.md from agent stdout, so the artifact IS the work.
const SKIP_ELIGIBLE_STEPS = new Set(["spec", "research", "plan"]);

// Single declarative source of truth for which agent steps declare an output
// artifact, the artifact basename, and the completion-proof policy applied after
// the step exits 0. ARTIFACT_STEPS (used for File-Artifact-Mode prompt
// suppression) is derived from its keys — no second hand-maintained list. The
// derived basenames equal `name.toUpperCase()+".md"`, matching the canonical
// artifact-path derivation used when the artifact is written.
type ProofPolicy = "nonempty" | "spec-min-bytes" | "fix-conditional";
export const STEP_ARTIFACTS = new Map<string, { artifact: string; proof: ProofPolicy }>([
  ["spec",          { artifact: "SPEC.md",          proof: "spec-min-bytes" }],
  ["research",      { artifact: "RESEARCH.md",      proof: "nonempty" }],
  ["plan",          { artifact: "PLAN.md",          proof: "nonempty" }],
  ["build",         { artifact: "BUILD.md",         proof: "nonempty" }],
  ["review",        { artifact: "REVIEW.md",        proof: "nonempty" }],
  ["fix",           { artifact: "FIX.md",           proof: "fix-conditional" }],
  ["final_fix",     { artifact: "FINAL_FIX.md",     proof: "nonempty" }],
  ["documentation", { artifact: "DOCUMENTATION.md", proof: "nonempty" }],
]);

const ARTIFACT_STEPS = new Set(STEP_ARTIFACTS.keys());

const ARTIFACT_SUPPRESS_PROMPT =
  "You are in File Artifact Mode for this invocation. Output only the requested document content as clean structured Markdown. Do not include insight blocks, star-marker commentary, educational explanations, contribution requests, confirmation sentences, narration, or trailing commentary. Produce the file — nothing else.";

export function parseSnapshotPaths(snapshot: string): Set<string> {
  const paths = new Set<string>();
  for (const raw of snapshot.split("\n")) {
    if (!raw) continue;
    const xy = raw.slice(0, 2);
    if (xy === "??") {
      const p = raw.slice(3).replace(/^"/, "").replace(/"$/, "");
      if (p.startsWith("src/") || p.startsWith("scripts/")) paths.add(p);
      continue;
    }
    let p = raw.slice(3);
    if (xy[0] === "R" || xy[0] === "C") {
      const arrow = p.lastIndexOf(" -> ");
      if (arrow !== -1) p = p.slice(arrow + 4);
    }
    p = p.replace(/^"/, "").replace(/"$/, "");
    paths.add(p);
  }
  return paths;
}

async function appendDocumentationPaths(repoRoot: string, buildMdPath: string, log: Logger, cycleId: string, preSnapshot: string): Promise<void> {
  let text: string;
  try {
    text = await readFile(buildMdPath, "utf8");
  } catch {
    return;
  }

  const lines = text.split("\n");
  const headerIdx = lines.findIndex((l) => l.trim() === "## Touched Files");
  if (headerIdx === -1) return;

  const touchedSet = new Set<string>();
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith("##")) break;
    const m = /^\s*-\s+(.+)/.exec(lines[i]);
    if (m) touchedSet.add(m[1].trim());
  }

  const prePaths = parseSnapshotPaths(preSnapshot);

  const result = spawnSync("git", ["status", "--porcelain"], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
  });

  const toAppend = Array.from(parseSnapshotPaths(result.stdout ?? ""))
    .filter((p) => !isDenied(p) && !prePaths.has(p) && !touchedSet.has(p));

  if (toAppend.length === 0) return;

  let insertIdx = lines.length;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith("##")) { insertIdx = i; break; }
  }
  while (insertIdx > headerIdx + 1 && lines[insertIdx - 1].trim() === "") {
    insertIdx--;
  }

  lines.splice(insertIdx, 0, ...toAppend.map((p) => `- ${p}`));
  await writeFile(buildMdPath, lines.join("\n"), "utf8");
  await log.emit("documentation.paths_appended", { cycle_id: cycleId, appended: toAppend });
}

async function accumulateTouchedFiles(
  repoRoot: string,
  artifactDir: string,
  preSnapshot: string,
): Promise<void> {
  const prePaths = parseSnapshotPaths(preSnapshot);

  const post = spawnSync("git", ["status", "--porcelain"], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
  });
  const newFiles = Array.from(parseSnapshotPaths(post.stdout ?? ""))
    .filter((p) => !isDenied(p) && !prePaths.has(p));

  const touchedPath = join(artifactDir, "touched.json");
  let existing: string[] = [];
  try {
    const raw = await readFile(touchedPath, "utf8");
    const parsed = JSON.parse(raw) as { files?: unknown };
    if (Array.isArray(parsed.files)) existing = parsed.files as string[];
  } catch { /* absent or corrupt — start fresh */ }

  const merged = Array.from(new Set([...existing, ...newFiles])).sort();
  await writeFile(touchedPath, JSON.stringify({ files: merged }, null, 2) + "\n", "utf8");
}

// Shared emptiness definition for the completion-proof contract and the
// retry-skip gate. A file is "empty" when it is missing/unreadable, 0 bytes, or
// whitespace-only. Fails closed: an unreadable artifact cannot be proven
// non-empty, so it is classified "empty" (which drives a visible step failure /
// a refusal to skip) rather than swallowed into a pass.
export async function classifyArtifact(artifactPath: string): Promise<"empty" | "nonempty"> {
  try {
    const content = await readFile(artifactPath, "utf8");
    return content.trim().length === 0 ? "empty" : "nonempty";
  } catch {
    return "empty"; // missing / unreadable — cannot prove non-empty
  }
}

export async function shouldSkipForArtifact(
  artifactDir: string,
  stepName: string,
): Promise<{ skip: false } | { skip: true; artifactPath: string }> {
  if (!SKIP_ELIGIBLE_STEPS.has(stepName)) return { skip: false };
  const artifactPath = join(artifactDir, `${stepName.toUpperCase()}.md`);
  if ((await classifyArtifact(artifactPath)) === "nonempty") return { skip: true, artifactPath };
  return { skip: false };
}

export const SPEC_MIN_BYTES = 200;

export const MAX_STEP_END_STDERR = 2000;
export const MAX_STEP_END_STDOUT = 2000;
export function formatSpecGuardError(path: string, bytes: number, threshold: number): string {
  return `spec post-condition failed: ${path} is ${bytes} bytes (< ${threshold})`;
}

export function formatFixGuardError(fixPath: string, mustFixPath: string, count: number): string {
  return `fix step produced empty FIX.md while MUST-FIX.md has ${count} task(s) [fix: ${fixPath}, must-fix: ${mustFixPath}]`;
}

export function formatEmptyDiffGuardError(stepName: string): string {
  return `${stepName} post-condition failed: no code changes detected (step reported ok but git status --porcelain -- src scripts tests is empty)`;
}

export function formatCompletionProofError(stepName: string, artifactPath: string): string {
  return `${stepName} exited 0 but ${artifactPath} is empty — treating as failure`;
}

export async function findPriorStepHeadSha(
  repoRoot: string,
  cycleId: string,
  stepName: string,
): Promise<string | null | "missing"> {
  let text: string;
  try {
    text = await readFile(join(repoRoot, ".cycle", "log.jsonl"), "utf8");
  } catch {
    return null;
  }
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let ev: { event?: string; step?: string; cycle_id?: string; head_sha?: unknown };
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.event !== "step.start") continue;
    if (ev.step !== stepName) continue;
    if (ev.cycle_id !== cycleId) continue;
    return typeof ev.head_sha === "string" ? ev.head_sha : "missing";
  }
  return null;
}

export const findPriorBuildHeadSha = (repoRoot: string, cycleId: string) =>
  findPriorStepHeadSha(repoRoot, cycleId, "build");

export type RunCycleOpts = {
  issueId: string;
  title: string;
  workflow: string;
  cycleId?: string;
  env?: Record<string, string>;
  resume?: { startStepIndex: number };
  attempt?: number;
  skipCompletedOnRetry?: boolean;
  baseBranch?: string;
  sleepFn?: (ms: number) => Promise<void>;
  nowFn?: () => number;
};

export async function runCycle(repoRoot: string, opts: RunCycleOpts) {
  const cycleId = opts.cycleId ?? (await allocateCycleId(repoRoot));
  const log = await createLogger(repoRoot);
  const slug = slugify(opts.title);
  const mergedEnv = opts.env ? { ...process.env, ...(opts.env) } as Record<string, string | undefined> : undefined;
  const cfg = await loadConfig(repoRoot, mergedEnv);
  const wf = cfg.workflows.find((w) => w.name === opts.workflow);
  if (!wf) throw new Error(`unknown workflow: ${opts.workflow}`);

  let artifactDir: string;
  if (opts.resume) {
    await log.emit("cycle.resume", {
      cycle_id: cycleId,
      workflow: opts.workflow,
      title: opts.title,
      issue_id: opts.issueId,
      start_step_index: opts.resume.startStepIndex,
    });
    if (cfg.engine.commit.mode !== "worktree-pr") {
      ({ artifactDir } = await prepareTrunkArtifactDir(repoRoot, { cycleId, workflow: opts.workflow, slug }));
    } else {
      ({ artifactDir } = await checkoutCycleBranch(repoRoot, { cycleId, workflow: opts.workflow, slug }));
    }
  } else {
    await log.emit("cycle.start", { cycle_id: cycleId, workflow: opts.workflow, title: opts.title, issue_id: opts.issueId });
    if (cfg.engine.commit.mode !== "worktree-pr") {
      ({ artifactDir } = await prepareTrunkArtifactDir(repoRoot, { cycleId, workflow: opts.workflow, slug }));
    } else {
      ({ artifactDir } = await createCycleBranch(repoRoot, { cycleId, workflow: opts.workflow, slug }));
    }
  }

  const cycleEnv: Record<string, string> = {
    CYCLE_ID: cycleId,
    CYCLE_TITLE: opts.title,
    CYCLE_BASE: process.env.CYCLE_BASE ?? resolveBaseBranch(cfg.engine.base_branch, opts.baseBranch),
    ...(opts.issueId ? { CYCLE_ISSUE_ID: opts.issueId } : {}),
    ...(opts.env ?? {}),
  };

  const sleepFn = opts.sleepFn ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const nowFn = opts.nowFn ?? (() => Date.now());

  try {
    const startIdx = opts.resume?.startStepIndex ?? 0;
    const attempt = opts.attempt ?? 0;
    const skipEnabled = opts.skipCompletedOnRetry !== false;
    for (let i = startIdx; i < wf.steps.length; i++) {
      const step = wf.steps[i];
      const stepStart = nowFn();

      let headSha: string | null = null;
      const isResetEligible = RESET_ELIGIBLE_STEPS.has(step.name);
      const isResumeEntry = !!opts.resume && i === startIdx;

      if (attempt > 0 && skipEnabled && !isResumeEntry && step.agent !== "bash") {
        const gate = await shouldSkipForArtifact(artifactDir, step.name);
        if (gate.skip) {
          await log.emit("step.skipped", {
            cycle_id: cycleId,
            step: step.name,
            reason: "artifact_present",
            artifact_path: gate.artifactPath,
          });
          continue;
        }
      }

      if (step.skip_unless) {
        const guardPath = join(artifactDir, step.skip_unless);
        let present = false;
        try {
          const st = await stat(guardPath);
          present = st.isFile();
        } catch {
          // ENOENT or unreadable — treat as absent
        }
        if (!present) {
          await log.emit("step.end", {
            cycle_id: cycleId,
            step: step.name,
            status: "skipped",
            reason: "skip_unless_artifact_missing",
            artifact: step.skip_unless,
            duration_ms: Math.max(0, Math.round(nowFn() - stepStart)),
          });
          continue;
        }
      }

      if (isResetEligible && cfg.engine.commit.mode === "worktree-pr") {
        if (!isResumeEntry) {
          headSha = await revParseHead(repoRoot);
        } else {
          const prior = await findPriorStepHeadSha(repoRoot, cycleId, step.name);
          if (prior === null || prior === "missing") {
            await log.emit("step.warning", { cycle_id: cycleId, step: step.name, reason: `${step.name}_pre_sha_missing` });
            headSha = await revParseHead(repoRoot);
          } else if (!(await shaExists(repoRoot, prior))) {
            await log.emit("step.warning", { cycle_id: cycleId, step: step.name, reason: `${step.name}_pre_sha_unreachable`, sha: prior });
            headSha = await revParseHead(repoRoot);
          } else {
            const { cleanWarning } = await resetCycleBranchTo(repoRoot, prior);
            if (cleanWarning) {
              await log.emit("step.warning", { cycle_id: cycleId, step: step.name, reason: "clean_failed", detail: cleanWarning });
            }
            headSha = prior;
          }
        }
      }

      await log.emit("step.start", {
        cycle_id: cycleId,
        step: step.name,
        agent: step.agent,
        ...(headSha ? { head_sha: headSha } : {}),
      });
      let preSnapshot = "";
      if (step.name === "documentation" || RESET_ELIGIBLE_STEPS.has(step.name)) {
        const snap = spawnSync("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8", shell: false });
        preSnapshot = snap.stdout ?? "";
      }
      const appendSP = step.agent !== "bash" && ARTIFACT_STEPS.has(step.name ?? "")
        ? ARTIFACT_SUPPRESS_PROMPT
        : undefined;
      if (appendSP !== undefined && step.agent !== "claudecode") {
        await log.emit("step.warning", {
          cycle_id: cycleId,
          step: step.name,
          reason: "append_system_prompt_ignored",
          agent: step.agent,
        });
      }
      // Compress-output hook (opt-in, claudecode-only). When enabled, materialize
      // the claude --settings file registering the PreToolUse Bash hook. Fail
      // open: a write failure logs a step.warning and the step runs without the
      // hook (compression simply doesn't apply that step).
      let settingsPath: string | undefined;
      if (cfg.engine.compress_output === true && step.agent === "claudecode") {
        try {
          const obj = buildCompressHookSettings({ execPath: process.execPath, cliPath: process.argv[1] });
          const p = join(repoRoot, ".cycle", "compress-hook-settings.json");
          await writeFile(p, JSON.stringify(obj, null, 2), "utf8");
          settingsPath = p;
        } catch (err) {
          await log.emit("step.warning", {
            cycle_id: cycleId,
            step: step.name,
            reason: "compress_hook_settings_failed",
            error: (err as Error).message,
          });
          // fail open: proceed without --settings
        }
      }
      let r: StepResult = { status: "failed", exitCode: -1, stdout: "", stderr: "" };
      let wasRateLimited = false;
      while (true) {
        if (step.agent === "bash") {
          r = await execBashStep(repoRoot, step.command!, cycleEnv);
        } else {
          try {
            const mod = resolveAgent(step.agent);
            r = await mod.runStep({
              repoRoot,
              promptPath: step.prompt!,
              env: cycleEnv,
              model: step.model,
              thinking: step.thinking,
              appendSystemPrompt: appendSP,
              timeoutMs: cfg.engine.step_timeout_ms,
              settingsPath,
            });
          } catch (err) {
            if (err instanceof UnknownAgentError) {
              r = { status: "failed", exitCode: -1, stdout: "", stderr: err.message };
            } else {
              throw err;
            }
          }
        }
        if (r.rateLimited) {
          const backoffMs = cfg.engine.rate_limit_backoff_ms ?? 3_600_000;
          const retryAt = new Date(Date.now() + backoffMs).toISOString();
          await log.emit("engine.paused", { reason: "rate_limit", retry_at: retryAt });
          await sleepFn(backoffMs);
          wasRateLimited = true;
          continue;
        }
        break;
      }
      if (wasRateLimited && r.status === "ok") {
        await log.emit("engine.resumed", { reason: "rate_limit_cleared" });
      }
      if (r.timedOut) {
        await log.emit("step.timeout", { cycle_id: cycleId, step: step.name, limit_ms: cfg.engine.step_timeout_ms ?? null });
      }
      if (step.agent !== "bash") {
        if ((r.status === "ok" || r.timedOut) && step.name) {
          const sanitized = sanitizeArtifactStdout(r.stdout);
          const artifactPath = join(artifactDir, `${step.name.toUpperCase()}.md`);
          await writeFile(artifactPath, sanitized, "utf8");
          // Completion-proof contract: one table-driven check per artifact step.
          // After exit 0 and the artifact write, verify the declared artifact is
          // non-empty per its proof policy; an empty artifact becomes a
          // retryable step failure (routed through the unchanged failure path
          // below) rather than a silent pass. The spec min-bytes and
          // fix-vs-MUST-FIX guards are folded in as proof policies here.
          if (STEP_ARTIFACTS.has(step.name)) {
            const { proof } = STEP_ARTIFACTS.get(step.name)!;
            let proofError: string | null = null;
            if (proof === "spec-min-bytes") {
              const bytes = Buffer.byteLength(sanitized, "utf8");
              if (bytes < SPEC_MIN_BYTES) proofError = formatSpecGuardError(artifactPath, bytes, SPEC_MIN_BYTES);
            } else if (proof === "fix-conditional") {
              const mustFixPath = join(artifactDir, "MUST-FIX.md");
              let mustFixContent = "";
              try { mustFixContent = await readFile(mustFixPath, "utf8"); } catch { /* absent */ }
              const taskCount = mustFixContent.split("\n").filter(l => /^\s*[-*]\s*\[/.test(l)).length;
              if (taskCount >= 1 && sanitized.trim().length === 0) {
                proofError = formatFixGuardError(artifactPath, mustFixPath, taskCount);
              }
            } else { // "nonempty"
              if ((await classifyArtifact(artifactPath)) === "empty") {
                proofError = formatCompletionProofError(step.name, artifactPath);
              }
            }
            await log.emit("step.completion_check", {
              cycle_id: cycleId,
              step: step.name,
              artifact: artifactPath,
              status: proofError ? "fail" : "pass",
            });
            if (proofError) {
              r.status = "failed";
              r.exitCode = r.exitCode || 1;
              r.stderr = proofError;
            } else if (r.timedOut) {
              // The step timed out, but its turn had completed and the declared
              // artifact passed its proof — the process just hung on exit
              // (claude -p exit hang). Accept the work instead of discarding it.
              r.status = "ok";
              await log.emit("step.timeout_salvaged", { cycle_id: cycleId, step: step.name, artifact: artifactPath });
            }
          }
          if (r.status === "ok" && (step.name === "build" || step.name === "fix")) {
            // Accept any change under src/, scripts/, or tests/ — test-only and
            // scripts-only fixes are legitimate build/fix outcomes. Use `git
            // status --porcelain` (not `git diff HEAD`) so newly-created
            // untracked files (e.g. a new test fixture) count as a change.
            const changed = spawnSync("git", ["status", "--porcelain", "--", "src", "scripts", "tests"], {
              cwd: repoRoot,
              encoding: "utf8",
              shell: false,
            });
            if (!changed.stdout || !changed.stdout.trim()) {
              r.status = "failed";
              r.exitCode = r.exitCode || 1;
              r.stderr = formatEmptyDiffGuardError(step.name);
            }
          }
        }
        if (r.status === "ok" && step.name === "reflection") {
          await ingestReflection(
            repoRoot, cycleId, slug, r.stdout, log,
            artifactDir,
            join(artifactDir, "touched.json"),
          );
        }
        if (r.status === "ok" && step.name === "documentation") {
          try {
            await appendDocumentationPaths(repoRoot, join(artifactDir, "BUILD.md"), log, cycleId, preSnapshot);
          } catch { /* best-effort append; never fail the cycle */ }
        }
        if (r.status === "ok" && RESET_ELIGIBLE_STEPS.has(step.name)) {
          try {
            await accumulateTouchedFiles(repoRoot, artifactDir, preSnapshot);
          } catch { /* best-effort; never fail the cycle */ }
        }
      }
      // Failed bash steps print their failure cause to stdout (test runners,
      // build tools), which the stderr-only excerpt above misses. Capture a
      // head-capped stdout excerpt for the event plus the full stdout+stderr
      // to a per-cycle `<step>.out` artifact pointed at by `stdout_artifact`.
      // Best-effort: a write failure degrades via `step.output_capture_failed`
      // and never masks the original step failure or its exit_code.
      let stdoutArtifact: string | undefined;
      const isFailedBash = step.agent === "bash" && r.status === "failed";
      if (isFailedBash) {
        const outPath = join(artifactDir, `${step.name}.out`);
        const fullOutput = `=== stdout ===\n${r.stdout}\n=== stderr ===\n${r.stderr}\n`;
        try {
          await writeFile(outPath, fullOutput, "utf8");
          stdoutArtifact = outPath;
        } catch (err) {
          await log.emit("step.output_capture_failed", {
            cycle_id: cycleId,
            step: step.name,
            artifact: outPath,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      await log.emit("step.end", {
        cycle_id: cycleId,
        step: step.name,
        status: r.status,
        exit_code: r.exitCode,
        duration_ms: Math.max(0, Math.round(nowFn() - stepStart)),
        ...(r.status === "failed"
          ? { stderr: truncateHeadCapped(r.stderr, MAX_STEP_END_STDERR) }
          : {}),
        ...(isFailedBash
          ? { stdout: truncateHeadCapped(r.stdout, MAX_STEP_END_STDOUT) }
          : {}),
        ...(stdoutArtifact ? { stdout_artifact: stdoutArtifact } : {}),
      });
      if (r.status === "failed") {
        if (step.name === "reflection") {
          await log.emit("reflection.skipped", { cycle_id: cycleId, reason: "exec_failed", exit_code: r.exitCode });
          continue;
        }
        if (step.name === "documentation") {
          await log.emit("documentation.skipped", { cycle_id: cycleId, reason: "exec_failed", exit_code: r.exitCode });
          continue;
        }
        await log.emit("cycle.end", { cycle_id: cycleId, status: "failed", failing_step: step.name });
        return { cycleId, artifactDir, status: "failed" as const, failingStep: step.name };
      }
    }

    await log.emit("cycle.end", { cycle_id: cycleId, status: "ok" });
    return { cycleId, artifactDir, status: "ok" as const };
  } finally {
    const headBefore = await currentBranchName(repoRoot);
    let checkoutOk = false;
    if (cfg.engine.commit.mode !== "worktree-pr") {
      // Trunk/local-only: never left base; record the no-op explicitly for the audit log.
      await log.emit("cycle.checkout", { cycle_id: cycleId, status: "skipped", base: cycleEnv.CYCLE_BASE, head_before: headBefore, reason: "trunk" });
      checkoutOk = true;
    } else {
      try {
        await checkoutBase(repoRoot, cycleEnv.CYCLE_BASE);
        checkoutOk = true;
        await log.emit("cycle.checkout", { cycle_id: cycleId, status: "ok", base: cycleEnv.CYCLE_BASE, head_before: headBefore });
      } catch (err) {
        await log.emit("cycle.checkout", { cycle_id: cycleId, status: "failed", base: cycleEnv.CYCLE_BASE, head_before: headBefore, reason: (err as Error).message });
      }
    }

    if (!checkoutOk) {
      await log.emit("cycle.base_pull", { cycle_id: cycleId, status: "skipped", base: cycleEnv.CYCLE_BASE, reason: "checkout failed" });
    } else {
      try {
        const { shaBefore, shaAfter } = await pullBase(repoRoot, cycleEnv.CYCLE_BASE);
        await log.emit("cycle.base_pull", { cycle_id: cycleId, status: "ok", base: cycleEnv.CYCLE_BASE, sha_before: shaBefore, sha_after: shaAfter });
      } catch (err) {
        await log.emit("cycle.base_pull", { cycle_id: cycleId, status: "failed", base: cycleEnv.CYCLE_BASE, reason: (err as Error).message });
      }
    }
  }
}
