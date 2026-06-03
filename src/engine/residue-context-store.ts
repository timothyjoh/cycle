import { readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import type { ResidueContext } from "./failed-residue-guard.ts";

// Cross-process persistence for the failed-cycle dirty-worktree residue guard
// (cycle 0039). The supervisor's in-memory pendingResidueContext is mirrored to
// .cycle/failed-residue-context.json at every terminal-failure branch, re-checked
// once at engine start (a fresh process has no in-flight log tail to re-arm the
// guard from), and deleted on every clear transition. Engine-owned (under .cycle/),
// so isEngineOwned already excludes it — the state file can never itself trip the
// guard it feeds.

export type ResidueStoreDeps = {
  readFileSync: (path: string, enc: "utf8") => string;
  writeFileSync: (path: string, data: string, enc: "utf8") => void;
  renameSync: (from: string, to: string) => void;
  unlinkSync: (path: string) => void;
};

const defaultDeps: ResidueStoreDeps = { readFileSync, writeFileSync, renameSync, unlinkSync };

export type ResidueReadResult =
  | { status: "none" }
  | { status: "ok"; ctx: ResidueContext }
  | { status: "corrupt"; error: string };

/** Atomic tmp+rename write (queue.ts idiom) — a crash mid-write leaves only
 *  `<path>.tmp` (engine-owned, ignored by the read path), never a half-written
 *  live file that crashes startup. */
export function writeResidueContext(
  path: string,
  ctx: ResidueContext,
  deps: ResidueStoreDeps = defaultDeps,
): void {
  const body = JSON.stringify({
    cycleId: ctx.cycleId,
    issueId: ctx.issueId,
    failingStep: ctx.failingStep ?? null,
  });
  const tmp = path + ".tmp";
  deps.writeFileSync(tmp, body, "utf8");
  deps.renameSync(tmp, path);
}

/** Missing file ⇒ none; unreadable / unparseable / wrong-shape ⇒ corrupt.
 *  Never throws — a corrupt context cannot attribute residue to a cycle, so the
 *  caller degrades to "no pending context" (with a warning) rather than crashing
 *  startup. Distinct from the git-status non-zero halt path. */
export function readResidueContext(
  path: string,
  deps: ResidueStoreDeps = defaultDeps,
): ResidueReadResult {
  let raw: string;
  try {
    raw = deps.readFileSync(path, "utf8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return { status: "none" };
    return { status: "corrupt", error: err.message };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { status: "corrupt", error: (e as Error).message };
  }
  if (!isValidContext(parsed)) {
    return { status: "corrupt", error: "missing or invalid required fields" };
  }
  const o = parsed as { cycleId: string; issueId: string; failingStep: string | null };
  return {
    status: "ok",
    ctx: { cycleId: o.cycleId, issueId: o.issueId, failingStep: o.failingStep ?? undefined },
  };
}

function isValidContext(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.cycleId === "string" && o.cycleId.length > 0 &&
    typeof o.issueId === "string" && o.issueId.length > 0 &&
    (o.failingStep === null || o.failingStep === undefined || typeof o.failingStep === "string")
  );
}

/** ENOENT swallowed (deleting an absent file is a no-op ⇒ idempotent); any other
 *  unlink error rethrows for the caller to log as a best-effort warning. */
export function deleteResidueContext(path: string, deps: ResidueStoreDeps = defaultDeps): void {
  try {
    deps.unlinkSync(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}
