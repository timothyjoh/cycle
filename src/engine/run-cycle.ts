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
import { spawnSync } from "node:child_process";
import { isDenied } from "./path-utils.ts";

const RESET_ELIGIBLE_STEPS = new Set(["build", "fix"]);

// SKIP_ELIGIBLE_STEPS must stay disjoint from any step that mutates the working
// tree on success — skipping such a step would lose the mutation. Pre-build
// artifact-producing steps (spec, research, plan) only write
// <artifactDir>/<STEP>.md from agent stdout, so the artifact IS the work.
const SKIP_ELIGIBLE_STEPS = new Set(["spec", "research", "plan"]);

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

  const prePaths = new Set<string>();
  for (const raw of preSnapshot.split("\n")) {
    if (!raw) continue;
    const xy = raw.slice(0, 2);
    if (xy === "??") continue;
    let p = raw.slice(3);
    if (xy[0] === "R" || xy[0] === "C") {
      const arrow = p.lastIndexOf(" -> ");
      if (arrow !== -1) p = p.slice(arrow + 4);
    }
    p = p.replace(/^"/, "").replace(/"$/, "");
    prePaths.add(p);
  }

  const result = spawnSync("git", ["status", "--porcelain"], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
  });

  const toAppend: string[] = [];
  for (const raw of (result.stdout ?? "").split("\n")) {
    if (!raw) continue;
    const xy = raw.slice(0, 2);
    if (xy === "??") continue;
    let p = raw.slice(3);
    if (xy[0] === "R" || xy[0] === "C") {
      const arrow = p.lastIndexOf(" -> ");
      if (arrow !== -1) p = p.slice(arrow + 4);
    }
    p = p.replace(/^"/, "").replace(/"$/, "");
    if (isDenied(p)) continue;
    if (prePaths.has(p)) continue;
    if (!touchedSet.has(p)) toAppend.push(p);
  }

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

export async function shouldSkipForArtifact(
  artifactDir: string,
  stepName: string,
): Promise<{ skip: false } | { skip: true; artifactPath: string }> {
  if (!SKIP_ELIGIBLE_STEPS.has(stepName)) return { skip: false };
  const artifactPath = join(artifactDir, `${stepName.toUpperCase()}.md`);
  try {
    const st = await stat(artifactPath);
    if (st.isFile() && st.size > 0) return { skip: true, artifactPath };
  } catch {
    // ENOENT or unreadable — fall through
  }
  return { skip: false };
}

export const SPEC_MIN_BYTES = 200;

export const MAX_STEP_END_STDERR = 2000;
export function formatSpecGuardError(path: string, bytes: number, threshold: number): string {
  return `spec post-condition failed: ${path} is ${bytes} bytes (< ${threshold})`;
}

export function formatFixGuardError(fixPath: string, mustFixPath: string, count: number): string {
  return `fix step produced empty FIX.md while MUST-FIX.md has ${count} task(s) [fix: ${fixPath}, must-fix: ${mustFixPath}]`;
}

export function formatEmptyDiffGuardError(stepName: string): string {
  return `${stepName} post-condition failed: no src/ changes detected (step reported ok but git diff HEAD -- src/ is empty)`;
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

  try {
    const startIdx = opts.resume?.startStepIndex ?? 0;
    const attempt = opts.attempt ?? 0;
    const skipEnabled = opts.skipCompletedOnRetry !== false;
    for (let i = startIdx; i < wf.steps.length; i++) {
      const step = wf.steps[i];

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
      if (step.name === "documentation") {
        const snap = spawnSync("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8", shell: false });
        preSnapshot = snap.stdout ?? "";
      }
      let r: StepResult;
      if (step.agent === "bash") {
        r = await execBashStep(repoRoot, step.command!, cycleEnv);
      } else {
        try {
          const mod = resolveAgent(step.agent);
          r = await mod.runStep({ repoRoot, promptPath: step.prompt!, env: cycleEnv, model: step.model, thinking: step.thinking });
        } catch (err) {
          if (err instanceof UnknownAgentError) {
            r = { status: "failed", exitCode: -1, stdout: "", stderr: err.message };
          } else {
            throw err;
          }
        }
        if (r.status === "ok" && step.name) {
          const sanitized = sanitizeArtifactStdout(r.stdout);
          const artifactPath = join(artifactDir, `${step.name.toUpperCase()}.md`);
          await writeFile(artifactPath, sanitized, "utf8");
          if (step.name === "spec") {
            const bytes = Buffer.byteLength(sanitized, "utf8");
            if (bytes < SPEC_MIN_BYTES) {
              r.status = "failed";
              r.exitCode = r.exitCode || 1;
              r.stderr = formatSpecGuardError(artifactPath, bytes, SPEC_MIN_BYTES);
            }
          }
          if (r.status === "ok" && step.name === "fix") {
            const mustFixPath = join(artifactDir, "MUST-FIX.md");
            let mustFixContent = "";
            try { mustFixContent = await readFile(mustFixPath, "utf8"); } catch { /* absent */ }
            const taskCount = mustFixContent.split("\n").filter(l => /^\s*[-*]\s*\[/.test(l)).length;
            if (taskCount >= 1 && sanitized.trim().length === 0) {
              r.status = "failed";
              r.exitCode = r.exitCode || 1;
              r.stderr = formatFixGuardError(artifactPath, mustFixPath, taskCount);
            }
          }
          if (r.status === "ok" && (step.name === "build" || step.name === "fix")) {
            const diff = spawnSync("git", ["diff", "HEAD", "--", "src/"], {
              cwd: repoRoot,
              encoding: "utf8",
              shell: false,
            });
            if (!diff.stdout) {
              r.status = "failed";
              r.exitCode = r.exitCode || 1;
              r.stderr = formatEmptyDiffGuardError(step.name);
            }
          }
        }
        if (r.status === "ok" && step.name === "reflection") {
          await ingestReflection(repoRoot, cycleId, slug, r.stdout, log);
        }
        if (r.status === "ok" && step.name === "documentation") {
          try {
            await appendDocumentationPaths(repoRoot, join(artifactDir, "BUILD.md"), log, cycleId, preSnapshot);
          } catch { /* best-effort append; never fail the cycle */ }
        }
      }
      await log.emit("step.end", {
        cycle_id: cycleId,
        step: step.name,
        status: r.status,
        exit_code: r.exitCode,
        ...(r.status === "failed"
          ? { stderr: truncateHeadCapped(r.stderr, MAX_STEP_END_STDERR) }
          : {}),
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
        return { cycleId, status: "failed" as const, failingStep: step.name };
      }
    }

    await log.emit("cycle.end", { cycle_id: cycleId, status: "ok" });
    return { cycleId, status: "ok" as const };
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
