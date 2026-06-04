import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildChildEnv } from "./child-env.ts";
import type { CommitConfig } from "./workflow.ts";
import { isDenied } from "./path-utils.ts";
import type { Logger } from "./log.ts";

/** Engine state-of-record files committed with every cycle (un-ignored cycle 0052). */
const STATE_FILES = [".cycle/log.jsonl", ".cycle/tbd.jsonl"] as const;

export type CommitResult =
  | { status: "ok"; sha: string }
  | { status: "skipped"; reason: "nothing_to_commit" }
  | { status: "failed"; reason: "commit_failed" | "push_failed"; attempt?: number };

/**
 * Result shape consumed from a spawned subprocess. Mirrors the relevant
 * fields of `child_process.spawnSync`'s return value.
 */
export interface SpawnResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Injectable subprocess runner. Defaults to {@link defaultSpawn} (real
 * `spawnSync`). Tests inject a deterministic stand-in so git/gh behavior
 * (push success/transient-failure/retry) is reproducible without a real
 * remote, network, or PATH-ordering luck. The seam wraps the SAME call sites
 * the production path uses, so the real error-handling branches (commit
 * failure, push retry, gitlink exclusion, closes-block) still execute.
 */
export type SpawnFn = (
  cmd: string,
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv },
) => SpawnResult;

/** Production subprocess runner: real `spawnSync`, array args, no shell. */
export const defaultSpawn: SpawnFn = (cmd, args, opts) => {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd,
    shell: false,
    encoding: "utf8",
    env: opts.env,
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};

function spawnGit(
  args: string[],
  cwd: string,
  envExtra: Record<string, string> | undefined,
  spawn: SpawnFn,
): { ok: boolean; stdout: string; stderr: string } {
  const env = buildChildEnv(envExtra ?? {});
  const r = spawn("git", args, { cwd, env });
  return { ok: r.status === 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

async function stageFiles(
  repoRoot: string,
  envExtra: Record<string, string> | undefined,
  spawn: SpawnFn,
): Promise<boolean> {
  const env = buildChildEnv(envExtra ?? {});

  const lsStage = spawn("git", ["ls-files", "--stage"], { cwd: repoRoot, env });
  const gitlinkPaths = new Set<string>();
  for (const line of (lsStage.stdout ?? "").split("\n")) {
    if (line.startsWith("160000 ")) {
      const parts = line.split("\t");
      if (parts[1]) gitlinkPaths.add(parts[1].trim());
    }
  }

  const status = spawn("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd: repoRoot, env,
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
      spawn("git", ["add", "-u", "--", p], { cwd: repoRoot, env });
    } else {
      spawn("git", ["add", "--", p], { cwd: repoRoot, env });
    }
  }

  // Explicitly stage the committed state-of-record files. existsSync guards the
  // fresh-repo case (file not yet written) — a missing file is skipped, not an
  // error. git add is idempotent, so double-staging with the status loop above
  // (the paths are not isDenied) coalesces harmlessly.
  for (const sf of STATE_FILES) {
    if (existsSync(join(repoRoot, sf))) {
      spawn("git", ["add", "--", sf], { cwd: repoRoot, env });
    }
  }

  const diff = spawnGit(["diff", "--cached", "--quiet"], repoRoot, envExtra, spawn);
  return !diff.ok;
}

export async function buildClosesBlock(
  issueId: string | undefined,
  repoRoot: string,
  envExtra?: Record<string, string>,
  spawn: SpawnFn = defaultSpawn,
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
  const ghResult = spawn(
    "gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
    { cwd: repoRoot, env },
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
    log?: Logger;
    artifactDir?: string;
    /**
     * Injectable subprocess runner. Defaults to the real `spawnSync`-backed
     * {@link defaultSpawn}. Tests inject a deterministic stand-in. Production
     * call sites never set this, so behavior is unchanged.
     */
    spawnFn?: SpawnFn;
  },
): Promise<CommitResult> {
  const { envExtra } = opts;
  const spawn = opts.spawnFn ?? defaultSpawn;

  // Read touched.json from cycle artifact dir (fallback: empty set if absent or artifactDir not provided)
  let touchedFiles = new Set<string>();
  if (opts.artifactDir) {
    try {
      const raw = await readFile(join(opts.artifactDir, "touched.json"), "utf8");
      const parsed = JSON.parse(raw) as { files?: unknown };
      if (Array.isArray(parsed.files)) touchedFiles = new Set(parsed.files as string[]);
    } catch { /* touched.json absent or corrupt */ }
  }

  // Warn (non-blocking) about src/ and scripts/ files absent from touched.json
  const statusOut = spawnGit(["status", "--porcelain"], repoRoot, envExtra, spawn);
  const warnFiles: string[] = [];
  for (const raw of statusOut.stdout.split("\n")) {
    if (!raw) continue;
    const xy = raw.slice(0, 2);
    if (xy[0] === "D" || xy[1] === "D") continue;
    let p = raw.slice(3);
    if (xy[0] === "R" || xy[0] === "C") {
      const arrow = p.lastIndexOf(" -> ");
      if (arrow !== -1) p = p.slice(arrow + 4);
    }
    p = p.replace(/^"/, "").replace(/"$/, "");
    if (isDenied(p)) continue;
    if (!p.startsWith("src/") && !p.startsWith("scripts/")) continue;
    if (!touchedFiles.has(p)) warnFiles.push(p);
  }
  if (warnFiles.length > 0) {
    await opts.log?.emit("commit.scope_warning", { cycle_id: opts.cycleId, files: warnFiles });
  }

  const hasChanges = await stageFiles(repoRoot, envExtra, spawn);
  if (!hasChanges) return { status: "skipped", reason: "nothing_to_commit" };

  const closes = await buildClosesBlock(opts.issueId, repoRoot, envExtra, spawn);
  const subject = `cycle ${opts.cycleId}: ${opts.title}`;
  const commitArgs = closes
    ? ["commit", "-m", subject, "-m", closes]
    : ["commit", "-m", subject];

  const commitResult = spawnGit(commitArgs, repoRoot, envExtra, spawn);
  if (!commitResult.ok) return { status: "failed", reason: "commit_failed" };

  const shaResult = spawnGit(["rev-parse", "HEAD"], repoRoot, envExtra, spawn);
  const sha = shaResult.stdout.trim();

  if (!opts.config.push || opts.config.mode === "local-only") return { status: "ok", sha };

  const BACKOFF_MS = [1000, 2000, 4000];
  for (let attempt = 0; attempt < 3; attempt++) {
    const pushResult = spawnGit(["push", "origin", opts.baseBranch], repoRoot, envExtra, spawn);
    if (pushResult.ok) return { status: "ok", sha };
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
    }
  }
  return { status: "failed", reason: "push_failed", attempt: 3 };
}
