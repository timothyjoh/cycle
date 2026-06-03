import { spawnSync } from "node:child_process";
import { isDenied } from "./path-utils.ts";

export type ResidueContext = {
  cycleId: string;
  issueId: string;
  failingStep: string | undefined;
};

/** Unfiltered porcelain parse: every tracked change + every untracked path,
 *  rename/copy target only. Differs from run-cycle's src/scripts-filtered parser
 *  (run-cycle.ts parseSnapshotPaths) — the guard must trip on residue anywhere,
 *  not just under src/ and scripts/. */
export function parseDirtyPaths(snapshot: string): string[] {
  const paths = new Set<string>();
  for (const raw of snapshot.split("\n")) {
    if (!raw) continue;
    const xy = raw.slice(0, 2);
    if (xy === "??") {
      paths.add(raw.slice(3).replace(/^"/, "").replace(/"$/, ""));
      continue;
    }
    let p = raw.slice(3);
    if (xy[0] === "R" || xy[0] === "C") {
      const arrow = p.lastIndexOf(" -> ");
      if (arrow !== -1) p = p.slice(arrow + 4);
    }
    paths.add(p.replace(/^"/, "").replace(/"$/, ""));
  }
  return [...paths];
}

/** Engine-owned runtime/bookkeeping paths the engine mutates every run — these
 *  must never trip the guard. Reuses isDenied (path-utils) for the
 *  .claude/dist/node_modules/*.lock/cycle.pid cases and layers the two engine
 *  trees it does not cover: .cycle/** (log.jsonl, tbd.jsonl, run.log, engine.lock,
 *  queue state) and docs/cycle/** (issue-lifecycle moves + workflow artifact docs).
 *  Mainline cannot rely on .gitignore for .cycle/** exclusion the way recon does. */
export function isEngineOwned(p: string): boolean {
  const q = p.replace(/\/$/, "");
  if (isDenied(q)) return true;
  if (q === ".cycle" || q.startsWith(".cycle/")) return true;
  if (q === "docs/cycle" || q.startsWith("docs/cycle/")) return true;
  return false;
}

/** Read the worktree's dirty state, excluding engine-owned paths.
 *  THROWS on git non-zero exit (corrupt repo / not-a-repo / git missing) — a
 *  failed status check is never coerced to "clean" (an empty paths array). A
 *  spawnSync error (ENOENT) leaves result.status === null and result.error set,
 *  which is treated as non-zero and throws carrying the error message. */
export function readFailedCycleResidue(cwd: string): { stdout: string; paths: string[] } {
  const r = spawnSync(
    "git",
    ["status", "--porcelain", "--untracked-files=all"],
    { cwd, encoding: "utf8", shell: false },
  );
  if (r.status !== 0) {
    const detail = r.stderr || r.stdout || r.error?.message || `exit ${r.status}`;
    throw new Error(`git status --porcelain --untracked-files=all failed: ${detail}`);
  }
  const paths = parseDirtyPaths(r.stdout).filter((p) => !isEngineOwned(p));
  return { stdout: r.stdout, paths: [...new Set(paths)].sort() };
}

export function formatFailedCycleResidueDiagnostic(
  ctx: ResidueContext,
  dirtyPaths: string[],
): string {
  const cycleText = ctx?.cycleId ? ` from failed cycle ${ctx.cycleId}` : "";
  return [
    `Dirty worktree residue${cycleText} remains after terminal failure.`,
    "Resolve it before the engine starts or resumes another cycle:",
    "  - commit it, or",
    "  - stash it (git stash), or",
    "  - discard it (git reset --hard).",
    "Dirty paths:",
    ...dirtyPaths.map((p) => `- ${p}`),
  ].join("\n");
}
