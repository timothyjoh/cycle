import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { parseDirtyPaths, isEngineOwned, readFailedCycleResidue } from "./failed-residue-guard.ts";

/** Outcome of a failed-cycle teardown. `ok` is true only when the worktree is
 *  clean of *non-engine-owned* residue afterwards — the caller relies on that to
 *  decide between a clean restart (ok) and the fallback residue halt (!ok). */
export interface TeardownResult {
  ok: boolean;
  /** Paths restored-to-HEAD or removed (best-effort, for logging). */
  reverted: string[];
  /** Non-engine-owned paths still dirty after teardown (empty when ok). */
  remaining: string[];
  /** Set when ok is false for a reason other than leftover paths (git error). */
  reason?: string;
}

function git(cwd: string, args: string[]): { ok: boolean; detail: string } {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  if (r.status !== 0) {
    return { ok: false, detail: r.stderr || r.stdout || r.error?.message || `exit ${r.status}` };
  }
  return { ok: true, detail: r.stdout };
}

/** Split a porcelain snapshot's non-engine-owned paths into tracked (in the
 *  index/HEAD) vs untracked (`??`). Reuses parseDirtyPaths for path extraction
 *  (rename arrow handling) and isEngineOwned to skip `.cycle/**`, `docs/cycle/**`,
 *  and the isDenied set — those are never touched by teardown. */
function categorize(snapshot: string): { tracked: string[]; untracked: string[] } {
  const tracked = new Set<string>();
  const untracked = new Set<string>();
  for (const raw of snapshot.split("\n")) {
    if (!raw) continue;
    const xy = raw.slice(0, 2);
    const [p] = parseDirtyPaths(raw);
    if (p === undefined || isEngineOwned(p)) continue;
    if (xy === "??") untracked.add(p);
    else tracked.add(p);
  }
  return { tracked: [...tracked], untracked: [...untracked] };
}

/** Revert a failed cycle's non-engine-owned worktree changes so the engine can
 *  restart the cycle on a clean tree (or, when attempts are exhausted, halt on a
 *  clean tree). Two-phase to handle every porcelain state including staged-adds
 *  and renames:
 *    1. `git reset HEAD -- <paths>` unstages everything (staged-adds become `??`,
 *       the index matches HEAD for modified tracked files);
 *    2. re-read porcelain, then `git checkout -- <tracked>` restores HEAD content
 *       and `rmSync` removes the now-untracked files.
 *  Engine-owned state (`.cycle/**`, the queue, the log, `docs/cycle/**` issue
 *  moves + artifact docs) is never passed to git, so it is preserved. When
 *  `wipeDocs` is set the cycle's own artifact dir is removed too, so the restart
 *  regenerates its documents from scratch (not a skip-completed resume).
 *  Never throws: any git error yields `ok: false` so the caller falls back to the
 *  residue halt rather than proceeding on a dirty tree. */
export function teardownFailedCycle(
  cwd: string,
  opts: { artifactDir?: string; wipeDocs: boolean },
): TeardownResult {
  const reverted: string[] = [];

  let snapshot: string;
  try {
    snapshot = readFailedCycleResidue(cwd).stdout;
  } catch (err) {
    return { ok: false, reverted, remaining: [], reason: (err as Error).message };
  }

  const { tracked, untracked } = categorize(snapshot);
  const all = [...tracked, ...untracked];

  if (all.length > 0) {
    const reset = git(cwd, ["reset", "-q", "HEAD", "--", ...all]);
    if (!reset.ok) {
      return { ok: false, reverted, remaining: all, reason: `git reset failed: ${reset.detail}` };
    }
  }

  // Re-categorize after unstaging: staged-adds and rename targets are now `??`.
  let snap2: string;
  try {
    snap2 = readFailedCycleResidue(cwd).stdout;
  } catch (err) {
    return { ok: false, reverted, remaining: all, reason: (err as Error).message };
  }
  const cat2 = categorize(snap2);

  if (cat2.tracked.length > 0) {
    const co = git(cwd, ["checkout", "--", ...cat2.tracked]);
    if (!co.ok) {
      return {
        ok: false,
        reverted,
        remaining: [...cat2.tracked, ...cat2.untracked],
        reason: `git checkout failed: ${co.detail}`,
      };
    }
    reverted.push(...cat2.tracked);
  }

  for (const p of cat2.untracked) {
    try {
      rmSync(join(cwd, p), { recursive: true, force: true });
      reverted.push(p);
    } catch {
      // best-effort; the final residue re-check below is the source of truth
    }
  }

  if (opts.wipeDocs && opts.artifactDir) {
    try {
      rmSync(opts.artifactDir, { recursive: true, force: true });
      reverted.push(opts.artifactDir);
    } catch {
      // best-effort: the docs dir is engine-owned and won't trip the residue check
    }
  }

  let remaining: string[];
  try {
    remaining = readFailedCycleResidue(cwd).paths;
  } catch (err) {
    return { ok: false, reverted, remaining: [], reason: (err as Error).message };
  }
  return { ok: remaining.length === 0, reverted, remaining };
}
