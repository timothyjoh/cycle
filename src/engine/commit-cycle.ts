import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { buildChildEnv } from "./child-env.ts";
import type { CommitConfig } from "./workflow.ts";

export type CommitResult =
  | { status: "ok"; sha: string }
  | { status: "skipped"; reason: "nothing_to_commit" }
  | { status: "failed"; reason: "commit_failed" | "push_failed"; attempt?: number }
  | { status: "failed"; reason: "scope_violation"; blockedFiles: string[] };

const DENYLIST_PREFIXES = [".claude", "dist", "node_modules"];
const DENYLIST_EXACT = [".cycle/cycle.pid"];

function isDenied(p: string): boolean {
  const q = p.replace(/\/$/, "");
  for (const prefix of DENYLIST_PREFIXES) {
    if (q === prefix || q.startsWith(prefix + "/")) return true;
  }
  if (DENYLIST_EXACT.includes(q)) return true;
  if (q.endsWith(".lock")) return true;
  return false;
}

export async function parseTouchedFiles(buildMdPath: string): Promise<string[] | null> {
  let text: string;
  try {
    text = await readFile(buildMdPath, "utf8");
  } catch {
    return null;
  }
  const lines = text.split("\n");
  const headerIdx = lines.findIndex((l) => l.trim() === "## Touched Files");
  if (headerIdx === -1) return null;
  const files: string[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith("##")) break;
    const m = /^\s*-\s+(.+)/.exec(l);
    if (m) files.push(m[1].trim());
  }
  return files;
}

export async function scopeGuard(
  repoRoot: string,
  cycleId: string,
  envExtra?: Record<string, string>,
): Promise<string[]> {
  let buildMdPath: string | null = null;
  try {
    const entries = await readdir(join(repoRoot, "docs/cycle"));
    const match = entries.find((e) => e.startsWith(`${cycleId}-`));
    if (match) buildMdPath = join(repoRoot, "docs/cycle", match, "BUILD.md");
  } catch { /* docs/cycle missing */ }

  if (!buildMdPath) return [];
  const touched = await parseTouchedFiles(buildMdPath);
  if (touched === null) return [];

  const touchedSet = new Set(touched);
  const gitStatus = spawnGit(["status", "--porcelain"], repoRoot, envExtra);
  const blocked: string[] = [];
  for (const raw of gitStatus.stdout.split("\n")) {
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
    if (!touchedSet.has(p)) blocked.push(p);
  }
  return blocked;
}

function spawnGit(
  args: string[],
  cwd: string,
  envExtra?: Record<string, string>,
): { ok: boolean; stdout: string; stderr: string } {
  const env = buildChildEnv(envExtra ?? {});
  const r = spawnSync("git", args, { cwd, shell: false, encoding: "utf8", env });
  return { ok: r.status === 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

async function stageFiles(
  repoRoot: string,
  envExtra?: Record<string, string>,
): Promise<boolean> {
  const env = buildChildEnv(envExtra ?? {});

  const lsStage = spawnSync("git", ["ls-files", "--stage"], {
    cwd: repoRoot, shell: false, encoding: "utf8", env,
  });
  const gitlinkPaths = new Set<string>();
  for (const line of (lsStage.stdout ?? "").split("\n")) {
    if (line.startsWith("160000 ")) {
      const parts = line.split("\t");
      if (parts[1]) gitlinkPaths.add(parts[1].trim());
    }
  }

  const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd: repoRoot, shell: false, encoding: "utf8", env,
  });

  for (const raw of (status.stdout ?? "").split("\n")) {
    if (!raw) continue;
    const xy = raw.slice(0, 2);
    let p = raw.slice(3);
    if (xy[0] === "R" || xy[0] === "C") {
      const arrow = p.lastIndexOf(" -> ");
      if (arrow !== -1) p = p.slice(arrow + 4);
    }
    p = p.replace(/^"/, "").replace(/"$/, "");
    if (isDenied(p) || gitlinkPaths.has(p.replace(/\/$/, ""))) continue;

    const full = join(repoRoot, p);
    if (!existsSync(full)) {
      if (xy[0] === "D") continue;
      spawnSync("git", ["add", "-u", "--", p], { cwd: repoRoot, shell: false, env });
    } else {
      spawnSync("git", ["add", "--", p], { cwd: repoRoot, shell: false, env });
    }
  }

  const diff = spawnGit(["diff", "--cached", "--quiet"], repoRoot, envExtra);
  return !diff.ok;
}

export async function buildClosesBlock(
  issueId: string | undefined,
  repoRoot: string,
  envExtra?: Record<string, string>,
): Promise<string> {
  if (!issueId) return "";
  const issuePath = join(repoRoot, "docs/cycle/issues/todo", `${issueId}.md`);
  let body: string;
  try {
    body = await readFile(issuePath, "utf8");
  } catch {
    return "";
  }

  const env = buildChildEnv(envExtra ?? {});
  const ghResult = spawnSync(
    "gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
    { cwd: repoRoot, shell: false, encoding: "utf8", env },
  );
  const repoSlug = (ghResult.stdout ?? "").trim();
  if (!repoSlug) return "";

  const urlRe = /https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/issues\/(\d+)/g;
  const seen = new Set<string>();
  const lines: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(body)) !== null) {
    const [, owner, repo, num] = m;
    if (`${owner}/${repo}` === repoSlug && !seen.has(num)) {
      seen.add(num);
      lines.push(`Closes #${num}`);
    }
  }
  return lines.join("\n");
}

export async function commitCycle(
  repoRoot: string,
  opts: {
    cycleId: string;
    title: string;
    issueId?: string;
    config: CommitConfig;
    baseBranch: string;
    envExtra?: Record<string, string>;
  },
): Promise<CommitResult> {
  const { envExtra } = opts;
  const blockedFiles = await scopeGuard(repoRoot, opts.cycleId, envExtra);
  if (blockedFiles.length > 0) return { status: "failed", reason: "scope_violation", blockedFiles };
  const hasChanges = await stageFiles(repoRoot, envExtra);
  if (!hasChanges) return { status: "skipped", reason: "nothing_to_commit" };

  const closes = await buildClosesBlock(opts.issueId, repoRoot, envExtra);
  const subject = `cycle ${opts.cycleId}: ${opts.title}`;
  const commitArgs = closes
    ? ["commit", "-m", subject, "-m", closes]
    : ["commit", "-m", subject];

  const commitResult = spawnGit(commitArgs, repoRoot, envExtra);
  if (!commitResult.ok) return { status: "failed", reason: "commit_failed" };

  const shaResult = spawnGit(["rev-parse", "HEAD"], repoRoot, envExtra);
  const sha = shaResult.stdout.trim();

  if (!opts.config.push || opts.config.mode === "local-only") return { status: "ok", sha };

  const BACKOFF_MS = [1000, 2000, 4000];
  for (let attempt = 0; attempt < 3; attempt++) {
    const pushResult = spawnGit(["push", "origin", opts.baseBranch], repoRoot, envExtra);
    if (pushResult.ok) return { status: "ok", sha };
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
    }
  }
  return { status: "failed", reason: "push_failed", attempt: 3 };
}
