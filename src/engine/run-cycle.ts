import { allocateCycleId } from "./cycle-id.ts";
import { loadWorkflow } from "./workflow.ts";
import { createLogger } from "./log.ts";
import { execBashStep, type StepResult } from "./exec-bash.ts";
import { resolveAgent, UnknownAgentError } from "./exec.ts";
import { createCycleBranch, checkoutCycleBranch, checkoutBase, pullBase, prepareTrunkArtifactDir, revParseHead, resetCycleBranchTo, shaExists } from "./branch.ts";
import { ingestReflection } from "./reflection.ts";
import { slugify } from "../issue/id.ts";
import { spawn } from "node:child_process";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";

export async function findPriorBuildHeadSha(repoRoot: string, cycleId: string): Promise<string | null | "missing"> {
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
    if (ev.step !== "build") continue;
    if (ev.cycle_id !== cycleId) continue;
    return typeof ev.head_sha === "string" ? ev.head_sha : "missing";
  }
  return null;
}

function currentBranch(repoRoot: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoRoot, shell: false });
    let stdout = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.on("close", (code) => resolve(code === 0 ? stdout.trim() : null));
    child.on("error", () => resolve(null));
  });
}

export type RunCycleOpts = {
  issueId: string;
  title: string;
  workflow: string;
  cycleId?: string;
  env?: Record<string, string>;
  resume?: { startStepIndex: number };
};

export async function runCycle(repoRoot: string, opts: RunCycleOpts) {
  const cycleId = opts.cycleId ?? (await allocateCycleId(repoRoot));
  const log = await createLogger(repoRoot);
  const slug = slugify(opts.title);
  const wf = await loadWorkflow(repoRoot, opts.workflow);

  let artifactDir: string;
  if (opts.resume) {
    await log.emit("cycle.resume", {
      cycle_id: cycleId,
      workflow: opts.workflow,
      title: opts.title,
      issue_id: opts.issueId,
      start_step_index: opts.resume.startStepIndex,
    });
    if (wf.no_branch) {
      ({ artifactDir } = await prepareTrunkArtifactDir(repoRoot, { cycleId, workflow: opts.workflow, slug }));
    } else {
      ({ artifactDir } = await checkoutCycleBranch(repoRoot, { cycleId, workflow: opts.workflow, slug }));
    }
  } else {
    await log.emit("cycle.start", { cycle_id: cycleId, workflow: opts.workflow, title: opts.title, issue_id: opts.issueId });
    if (wf.no_branch) {
      ({ artifactDir } = await prepareTrunkArtifactDir(repoRoot, { cycleId, workflow: opts.workflow, slug }));
    } else {
      ({ artifactDir } = await createCycleBranch(repoRoot, { cycleId, workflow: opts.workflow, slug }));
    }
  }

  const cycleEnv: Record<string, string> = {
    CYCLE_ID: cycleId,
    CYCLE_TITLE: opts.title,
    CYCLE_BASE: process.env.CYCLE_BASE ?? "main",
    ...(opts.issueId ? { CYCLE_ISSUE_ID: opts.issueId } : {}),
    ...(opts.env ?? {}),
  };

  try {
    const startIdx = opts.resume?.startStepIndex ?? 0;
    for (let i = startIdx; i < wf.steps.length; i++) {
      const step = wf.steps[i];

      let headSha: string | null = null;
      const isBuild = step.name === "build";
      const isResumeEntry = !!opts.resume && i === startIdx;

      if (isBuild && !wf.no_branch) {
        if (!isResumeEntry) {
          headSha = await revParseHead(repoRoot);
        } else {
          const prior = await findPriorBuildHeadSha(repoRoot, cycleId);
          if (prior === null || prior === "missing") {
            await log.emit("step.warning", { cycle_id: cycleId, step: "build", reason: "build_pre_sha_missing" });
            headSha = await revParseHead(repoRoot);
          } else if (!(await shaExists(repoRoot, prior))) {
            await log.emit("step.warning", { cycle_id: cycleId, step: "build", reason: "build_pre_sha_unreachable", sha: prior });
            headSha = await revParseHead(repoRoot);
          } else {
            await resetCycleBranchTo(repoRoot, prior);
            headSha = prior;
          }
        }
      }

      await log.emit("step.start", { cycle_id: cycleId, step: step.name, agent: step.agent, ...(headSha ? { head_sha: headSha } : {}) });
      let r: StepResult;
      if (step.agent === "bash") {
        r = await execBashStep(repoRoot, step.command!, cycleEnv);
      } else {
        try {
          const mod = resolveAgent(step.agent);
          r = await mod.runStep({ repoRoot, promptPath: step.prompt!, env: cycleEnv });
        } catch (err) {
          if (err instanceof UnknownAgentError) {
            r = { status: "failed", exitCode: -1, stdout: "", stderr: err.message };
          } else {
            throw err;
          }
        }
        if (r.status === "ok" && step.name) {
          await writeFile(join(artifactDir, `${step.name.toUpperCase()}.md`), r.stdout, "utf8");
        }
        if (r.status === "ok" && step.name === "reflection") {
          await ingestReflection(repoRoot, cycleId, slug, r.stdout, log);
        }
      }
      await log.emit("step.end", { cycle_id: cycleId, step: step.name, status: r.status, exit_code: r.exitCode });
      if (r.status === "failed") {
        if (step.name === "reflection") {
          await log.emit("reflection.skipped", { cycle_id: cycleId, reason: "exec_failed", exit_code: r.exitCode });
          continue;
        }
        await log.emit("cycle.end", { cycle_id: cycleId, status: "failed", failing_step: step.name });
        return { cycleId, status: "failed" as const, failingStep: step.name };
      }
    }

    await log.emit("cycle.end", { cycle_id: cycleId, status: "ok" });
    return { cycleId, status: "ok" as const };
  } finally {
    const headBefore = await currentBranch(repoRoot);
    let checkoutOk = false;
    if (wf.no_branch) {
      // Trunk workflows never left base; record the no-op explicitly for the audit log.
      await log.emit("cycle.checkout", { cycle_id: cycleId, status: "skipped", base: cycleEnv.CYCLE_BASE, head_before: headBefore, reason: "no_branch" });
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
