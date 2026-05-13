import { allocateCycleId } from "./cycle-id.ts";
import { loadWorkflow } from "./workflow.ts";
import { createLogger } from "./log.ts";
import { execBashStep } from "./exec-bash.ts";
import { execClaudecodeStep } from "./exec-claudecode.ts";
import { createCycleBranch, checkoutBase } from "./branch.ts";
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
  env?: Record<string, string>;
};

export async function runCycle(repoRoot: string, opts: RunCycleOpts) {
  const cycleId = await allocateCycleId(repoRoot);
  const log = await createLogger(repoRoot);
  const slug = slugify(opts.title);
  const wf = await loadWorkflow(repoRoot, opts.workflow);

  await log.emit("cycle.start", { cycle_id: cycleId, workflow: opts.workflow, title: opts.title, issue_id: opts.issueId });
  const { artifactDir } = await createCycleBranch(repoRoot, { cycleId, workflow: opts.workflow, slug });

  const cycleEnv: Record<string, string> = {
    CYCLE_ID: cycleId,
    CYCLE_TITLE: opts.title,
    CYCLE_BASE: process.env.CYCLE_BASE ?? "main",
    ...(opts.issueId ? { CYCLE_ISSUE_ID: opts.issueId } : {}),
    ...(opts.env ?? {}),
  };

  try {
    for (const step of wf.steps) {
      await log.emit("step.start", { cycle_id: cycleId, step: step.name, agent: step.agent });
      let r;
      if (step.agent === "bash") {
        r = await execBashStep(repoRoot, step.command!, cycleEnv);
      } else if (step.agent === "claudecode") {
        r = await execClaudecodeStep(repoRoot, step.prompt!, cycleEnv);
        if (r.status === "ok" && step.name) {
          await writeFile(join(artifactDir, `${step.name.toUpperCase()}.md`), r.stdout, "utf8");
        }
      } else {
        throw new Error(`unknown agent: ${(step as { agent: string }).agent}`);
      }
      await log.emit("step.end", { cycle_id: cycleId, step: step.name, status: r.status, exit_code: r.exitCode });
      if (r.status === "failed") {
        await log.emit("cycle.end", { cycle_id: cycleId, status: "failed", failing_step: step.name });
        return { cycleId, status: "failed" as const, failingStep: step.name };
      }
    }

    await log.emit("cycle.end", { cycle_id: cycleId, status: "ok" });
    return { cycleId, status: "ok" as const };
  } finally {
    const headBefore = await currentBranch(repoRoot);
    try {
      await checkoutBase(repoRoot, cycleEnv.CYCLE_BASE);
      await log.emit("cycle.checkout", { cycle_id: cycleId, status: "ok", base: cycleEnv.CYCLE_BASE, head_before: headBefore });
    } catch (err) {
      await log.emit("cycle.checkout", { cycle_id: cycleId, status: "failed", base: cycleEnv.CYCLE_BASE, head_before: headBefore, reason: (err as Error).message });
    }
  }
}
