import { allocateCycleId } from "./cycle-id.ts";
import { loadWorkflow } from "./workflow.ts";
import { createLogger } from "./log.ts";
import { execBashStep } from "./exec-bash.ts";
import { execClaudecodeStep } from "./exec-claudecode.ts";
import { createCycleBranch, checkoutCycleBranch, checkoutBase, pullBase } from "./branch.ts";
import { ingestReflection } from "./reflection.ts";
import { slugify } from "../issue/id.ts";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

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
    ({ artifactDir } = await checkoutCycleBranch(repoRoot, { cycleId, workflow: opts.workflow, slug }));
  } else {
    await log.emit("cycle.start", { cycle_id: cycleId, workflow: opts.workflow, title: opts.title, issue_id: opts.issueId });
    ({ artifactDir } = await createCycleBranch(repoRoot, { cycleId, workflow: opts.workflow, slug }));
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
      await log.emit("step.start", { cycle_id: cycleId, step: step.name, agent: step.agent });
      let r;
      if (step.agent === "bash") {
        r = await execBashStep(repoRoot, step.command!, cycleEnv);
      } else if (step.agent === "claudecode") {
        r = await execClaudecodeStep(repoRoot, step.prompt!, cycleEnv);
        if (r.status === "ok" && step.name) {
          await writeFile(join(artifactDir, `${step.name.toUpperCase()}.md`), r.stdout, "utf8");
        }
        if (r.status === "ok" && step.name === "reflection") {
          await ingestReflection(repoRoot, cycleId, slug, r.stdout, log);
        }
      } else {
        throw new Error(`unknown agent: ${(step as { agent: string }).agent}`);
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
    try {
      await checkoutBase(repoRoot, cycleEnv.CYCLE_BASE);
      checkoutOk = true;
      await log.emit("cycle.checkout", { cycle_id: cycleId, status: "ok", base: cycleEnv.CYCLE_BASE, head_before: headBefore });
    } catch (err) {
      await log.emit("cycle.checkout", { cycle_id: cycleId, status: "failed", base: cycleEnv.CYCLE_BASE, head_before: headBefore, reason: (err as Error).message });
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
