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

/**
 * For no_branch workflows (e.g., e2e-tests on trunk): no checkout / branch
 * creation, just produce the per-cycle artifact directory so steps have a
 * stable place to write SPEC/PLAN/etc.
 */
export async function prepareTrunkArtifactDir(repoRoot: string, opts: { cycleId: string; workflow: string; slug: string }) {
  const artifactDir = join(repoRoot, "docs", "cycle", `${opts.cycleId}-${opts.workflow}-${opts.slug}`);
  await mkdir(artifactDir, { recursive: true });
  return { artifactDir };
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

export function currentBranchName(repoRoot: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoRoot, shell: false });
    let stdout = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.on("close", (code) => resolve(code === 0 ? stdout.trim() : null));
    child.on("error", () => resolve(null));
  });
}

export async function revParseHead(repoRoot: string): Promise<string | null> {
  return revParse(repoRoot, "HEAD");
}

function gitCleanSoft(repoRoot: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("git", ["clean", "-fd"], { cwd: repoRoot, shell: false });
    let stderr = "";
    child.stderr.on("data", d => { stderr += d.toString(); });
    child.on("close", code => resolve(code === 0 ? null : `git clean -fd failed: ${stderr.trim()}`));
    child.on("error", e => resolve(`git clean -fd failed: ${e.message}`));
  });
}

export async function resetCycleBranchTo(repoRoot: string, sha: string): Promise<{ cleanWarning?: string }> {
  const branch = await currentBranchName(repoRoot);
  if (!branch || !branch.startsWith("cycle/")) {
    throw new Error(`resetCycleBranchTo refuses to reset outside a cycle branch (HEAD=${branch ?? "unknown"})`);
  }
  await git(repoRoot, ["reset", "--hard", sha]);
  // -fd not -fdx: gitignored paths (dist/, node_modules/, .cycle/) are engine working state
  // and must survive mid-run. -fdx would wipe them and corrupt the in-progress cycle.
  const cleanErr = await gitCleanSoft(repoRoot);
  return cleanErr != null ? { cleanWarning: cleanErr } : {};
}

export function shaExists(repoRoot: string, sha: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd: repoRoot, shell: false });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

export function resolveBaseBranch(configBase: string, frontmatterBase?: string): string {
  return (frontmatterBase != null && frontmatterBase.length > 0) ? frontmatterBase : configBase;
}

function gitCapture(repoRoot: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd: repoRoot, shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", d => { stdout += d.toString(); });
    child.stderr.on("data", d => { stderr += d.toString(); });
    child.on("close", code => {
      if (code === 0) resolve(stdout);
      else reject(new Error("git " + args.join(" ") + " failed: " + stderr));
    });
    child.on("error", e => reject(e));
  });
}

export type CycleBranch = {
  branch: string;
  head_sha: string;
  last_commit_subject: string;
};

export async function listCycleBranches(repoRoot: string): Promise<CycleBranch[]> {
  const raw = await gitCapture(repoRoot, [
    "for-each-ref",
    "--format=%(refname:short)\t%(objectname:short)\t%(subject)",
    "refs/heads/cycle/",
  ]);
  return raw
    .split("\n")
    .filter(Boolean)
    .map(line => {
      const [branch, head_sha, ...rest] = line.split("\t");
      return { branch, head_sha, last_commit_subject: rest.join("\t") };
    });
}

export async function deleteBranch(repoRoot: string, branch: string): Promise<void> {
  await git(repoRoot, ["branch", "-D", branch]);
}

export async function isWorkingTreeDirty(repoRoot: string): Promise<boolean> {
  const out = await gitCapture(repoRoot, ["status", "--porcelain"]);
  return out.trim().length > 0;
}
