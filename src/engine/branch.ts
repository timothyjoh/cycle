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

export async function createCycleBranch(repoRoot: string, opts: { cycleId: string; workflow: string; slug: string }) {
  const branch = `cycle/${opts.workflow}/${opts.slug}`;
  await git(repoRoot, ["checkout", "-b", branch]);
  const artifactDir = join(repoRoot, "docs", "cycle", `${opts.cycleId}-${opts.workflow}-${opts.slug}`);
  await mkdir(artifactDir, { recursive: true });
  return { branch, artifactDir };
}

export async function checkoutBase(repoRoot: string, base: string): Promise<void> {
  await git(repoRoot, ["checkout", base]);
}
