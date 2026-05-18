import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  listCycleBranches,
  currentBranchName,
  deleteBranch,
  isWorkingTreeDirty,
  type CycleBranch,
} from "../engine/branch.ts";
import { readQueue } from "../engine/queue.ts";
import { parseFrontmatter } from "../engine/frontmatter.ts";
import { slugify } from "../issue/id.ts";
import { createLogger } from "../engine/log.ts";
import { loadConfig } from "../engine/workflow.ts";

export type CleanupDeps = {
  listCycleBranches: (root: string) => Promise<CycleBranch[]>;
  currentBranchName: (root: string) => Promise<string | null>;
  isWorkingTreeDirty: (root: string) => Promise<boolean>;
  deleteBranch: (root: string, branch: string) => Promise<void>;
  readQueue: typeof readQueue;
  readTodoFile: (root: string, relId: string) => Promise<string | null>;
  emitCleanupDeleted: (name: string, was_head_sha: string) => Promise<void>;
  resolveBaseBranch: (root: string) => Promise<string>;
};

export type CleanupResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const ISSUE_DIRS = ["todo", "done", "blocked", "failed"];

async function resolveBranchName(
  root: string,
  rowId: string,
  rowTitle: string,
  readTodoFile: CleanupDeps["readTodoFile"],
): Promise<string | null> {
  for (const dir of ISSUE_DIRS) {
    const body = await readTodoFile(root, dir + "/" + rowId);
    if (body === null) continue;
    const { fm } = parseFrontmatter(body);
    if (typeof fm.workflow === "string" && fm.workflow.length > 0) {
      return "cycle/" + fm.workflow + "/" + slugify(rowTitle);
    }
  }
  return null;
}

export async function runCliCleanupWithDeps(
  repoRoot: string,
  argv: string[],
  deps: CleanupDeps,
): Promise<CleanupResult> {
  const isDryRun = !argv.includes("--yes");
  const force = argv.includes("--force");
  const unknownFlags = argv.filter(
    f => f.startsWith("-") && !["--yes", "--dry-run", "--force"].includes(f)
  );
  if (unknownFlags.length > 0) {
    return { exitCode: 1, stdout: "", stderr: "Unknown flag(s): " + unknownFlags.join(", ") };
  }

  if (!force && await deps.isWorkingTreeDirty(repoRoot)) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "Working tree is dirty. Commit or stash changes, or pass --force.",
    };
  }

  const [branches, rows, head] = await Promise.all([
    deps.listCycleBranches(repoRoot),
    deps.readQueue(repoRoot),
    deps.currentBranchName(repoRoot),
  ]);

  const baseBranch = await deps.resolveBaseBranch(repoRoot);

  const liveNames = new Set<string>();
  for (const row of rows) {
    if (row.status !== "in_progress") continue;
    const name = await resolveBranchName(repoRoot, row.id, row.title, deps.readTodoFile);
    if (name !== null) liveNames.add(name);
  }

  const headIsOrphan = branches.some(b => b.branch === head && !liveNames.has(b.branch));
  if (headIsOrphan) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "HEAD is an orphaned branch (" + head + "). Check out master before running cleanup.",
    };
  }

  const orphans = branches.filter(b =>
    !liveNames.has(b.branch) &&
    b.branch !== head &&
    b.branch !== baseBranch
  );

  if (isDryRun) {
    const payload = orphans.map(b => ({
      branch: b.branch,
      head_sha: b.head_sha,
      last_commit_subject: b.last_commit_subject,
      in_progress_cycle_id: null,
    }));
    return { exitCode: 0, stdout: JSON.stringify(payload, null, 2), stderr: "" };
  }

  for (const b of orphans) {
    await deps.deleteBranch(repoRoot, b.branch);
    await deps.emitCleanupDeleted(b.branch, b.head_sha);
  }
  const payload = orphans.map(b => ({
    branch: b.branch,
    head_sha: b.head_sha,
    deleted_at: new Date().toISOString(),
  }));
  return { exitCode: 0, stdout: JSON.stringify(payload, null, 2), stderr: "" };
}

export async function runCliCleanup(
  repoRoot: string,
  argv: string[],
): Promise<CleanupResult> {
  const log = await createLogger(repoRoot, () => {});
  let cfg: Awaited<ReturnType<typeof loadConfig>> | null = null;
  try { cfg = await loadConfig(repoRoot); } catch { /* no config -> base = master */ }

  const deps: CleanupDeps = {
    listCycleBranches: (r) => listCycleBranches(r),
    currentBranchName: (r) => currentBranchName(r),
    isWorkingTreeDirty: (r) => isWorkingTreeDirty(r),
    deleteBranch: (r, b) => deleteBranch(r, b),
    readQueue,
    readTodoFile: async (root, relId) => {
      try { return await readFile(join(root, "docs/cycle/issues", relId + ".md"), "utf8"); }
      catch { return null; }
    },
    emitCleanupDeleted: (name, was_head_sha) =>
      log.emit("branch.cleanup_deleted", { name, was_head_sha, deleted_at: new Date().toISOString() }),
    resolveBaseBranch: async (root) => {
      if (cfg?.engine?.base_branch) return cfg.engine.base_branch;
      return "master";
    },
  };
  return runCliCleanupWithDeps(repoRoot, argv, deps);
}
