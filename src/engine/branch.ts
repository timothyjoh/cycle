import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

function git(repoRoot: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd: repoRoot, shell: false });
    let stderr = "";
    child.stderr.on("data", d => { stderr += d.toString(); });
    child.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(`git ${args.join(" ")} failed: ${stderr}`));
    });
  });
}

async function branchExists(repoRoot: string, branch: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("git", ["rev-parse", "--verify", `refs/heads/${branch}`], {
      cwd: repoRoot,
      shell: false,
    });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

export async function createCycleBranch(repoRoot: string, opts: { cycleId: string; workflow: string; slug: string }) {
  const branch = `cycle/${opts.workflow}/${opts.slug}`;
  // Branch may already exist from a prior cycle attempt that was retried; reuse it.
  if (await branchExists(repoRoot, branch)) {
    await git(repoRoot, ["checkout", branch]);
  } else {
    await git(repoRoot, ["checkout", "-b", branch]);
  }
  const artifactDir = join(repoRoot, "docs", "cycle", `${opts.cycleId}-${opts.workflow}-${opts.slug}`);
  await mkdir(artifactDir, { recursive: true });
  return { branch, artifactDir };
}

export async function checkoutCycleBranch(repoRoot: string, opts: { cycleId: string; workflow: string; slug: string }) {
  const branch = `cycle/${opts.workflow}/${opts.slug}`;
  await git(repoRoot, ["checkout", branch]);
  const artifactDir = join(repoRoot, "docs", "cycle", `${opts.cycleId}-${opts.workflow}-${opts.slug}`);
  await mkdir(artifactDir, { recursive: true });
  return { branch, artifactDir };
}

export async function checkoutBase(repoRoot: string, base: string): Promise<void> {
  await git(repoRoot, ["checkout", base]);
}

function revParse(repoRoot: string, ref: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("git", ["rev-parse", ref], { cwd: repoRoot, shell: false });
    let stdout = "";
    child.stdout.on("data", d => { stdout += d.toString(); });
    child.on("close", code => resolve(code === 0 ? stdout.trim() : null));
    child.on("error", () => resolve(null));
  });
}

export async function pullBase(repoRoot: string, base: string): Promise<{ shaBefore: string | null; shaAfter: string | null }> {
  const shaBefore = await revParse(repoRoot, base);
  await git(repoRoot, ["fetch", "origin", base]);
  await git(repoRoot, ["merge", "--ff-only", "FETCH_HEAD"]);
  const shaAfter = await revParse(repoRoot, base);
  return { shaBefore, shaAfter };
}
