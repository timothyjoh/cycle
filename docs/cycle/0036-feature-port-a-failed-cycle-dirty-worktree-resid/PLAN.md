# Implementation Plan: Cycle 0036

## Overview
Port a failed-cycle dirty-worktree residue guard into mainline: after a cycle ends in terminal failure, the supervisor checks the worktree for uncommitted residue (excluding engine-owned runtime paths) and, if any is present, halts cleanly with `engine.halted { reason: "failed_cycle_dirty_worktree" }` plus a remediation diagnostic on stderr — gating both the resume/retry path and the next-pending-issue loop path instead of piling further cycles on top of corrupted state.

## Current State (from Research)
- `src/cli.ts` is the supervisor: `runResumeOnce` (`:359–502`) runs once at startup against the log tail; the call-site (`:504–528`) inlines terminal accounting; the `while (!halted)` loop (`:531–711`) pops the next pending issue (`popNextPending`, `:542`) and dispatches three terminal-failure branches (commit `:619`, fast-bail `:672`, attempts-exhausted `:692`) via `recordTerminalFailure`. The terminal epilogue (`:713–730`) emits the max-consecutive `engine.halted` and always one `engine.stop`, then `process.exit`.
- `haltReason` union (`:276`) is `"max_consecutive_failures" | "triage_failed" | null` — must be widened.
- `src/engine/path-utils.ts` `isDenied` (`:4–12`) denies `.claude`/`dist`/`node_modules` prefixes, `*.lock`, and `.cycle/cycle.pid`. It does **not** cover `.cycle/run.log` or `docs/cycle/**`.
- Mainline `.gitignore` already excludes `.cycle/log.jsonl`, `.cycle/tbd.jsonl`, `.cycle/cycle.pid`, `.cycle/.sync-state.json`, `.cycle/coverage.lcov` — so `git status` never reports them. But it **does** report `.cycle/run.log` and `.cycle/engine.lock` (tracked, ` M`) and all `docs/cycle/**` issue-lifecycle moves and artifact docs (`??`/`D`). These are engine-owned and must be excluded explicitly.
- Recon's reference (`/mnt/c/Users/butters/wrk/recon/.cycle/bin/cycle.js`): `readFullRepoDirtyState` (`:9485`) `spawnSync("git", ["status","--porcelain","--untracked-files=all"], {shell:false})`, throws on non-zero status, returns `Array.from(new Set(paths)).sort()`; `formatFailedCycleResidueDiagnostic` (`:9500`); `haltIfFailedCycleResidue` (`:10691`) emits `engine.halted` + `engine.stop` + stderr, gated on an in-memory `pendingFailedResidueContext` set at each terminal failure; wired before `runResumeOnce` (`:10901`) and at loop-top (`:10934`). Recon relies on `.gitignore` for `.cycle/` exclusion — mainline cannot, so mainline adds explicit scoping.
- Test harness: `tests/cli/halt.test.ts` (`ensureDist`/`bootstrapRepo`/`seedTodo`/`workflowYml`/`verifyScript`/`readEvents`) spawns built `dist/cycle.js` against a real temp git repo (trunk commit mode). `tests/helpers.ts` `expectExactlyOne`. Coverage floors in `scripts/coverage-gate.mjs` `FLOORS`; pure modules floored at 100. Structural invariants in `scripts/structural-invariants.mjs` `INVARIANTS` (regex-count entries).

## Desired End State
- New module `src/engine/failed-residue-guard.ts` with a pure parser, a pure engine-owned exclusion predicate, a pure diagnostic formatter, and one `spawnSync`-based detector that throws on `git status` non-zero.
- `src/cli.ts` runs the guard at two sites (before `runResumeOnce`; at the top of the `while (!halted)` loop), both gated on an in-memory `pendingResidueContext` set at every terminal-failure branch. On residue it emits exactly one `engine.halted { reason: "failed_cycle_dirty_worktree", failed_cycle_id, issue_id, dirty_paths, message }`, exactly one terminal `engine.stop`, writes the diagnostic to stderr, and stops the loop. A clean tree (after exclusion) proceeds byte-for-byte unchanged.
- Docs updated (`CLAUDE.md`, `docs/ENGINE.md`); new per-file coverage floor; a structural invariant pinning the two guard call-sites.
- Verify: `npm test`, `npm run test:coverage`, `npm run check:coverage`, `npm run check:invariants`, `npm run typecheck` all clean.

## What We're NOT Doing
- **No cross-process persistence** (recon's `.cycle/failed-residue-context.json` startup re-check). The guard is in-process only this cycle; a startup-time re-check is deferred to a sibling cycle.
- **No auto-remediation** (no auto-stash/auto-reset). The guard halts and instructs; it never mutates the worktree.
- **No gating of the `drainRetry` (non-terminal retry) path.** Mirroring recon, `pendingResidueContext` is set only on *terminal* failures; an attempt that retries within budget is not residue-gated. (Noted as a known recon-parity gap.)
- **No change to `run-cycle.ts` `parseSnapshotPaths`** (the src/scripts-filtered untracked behavior used by the empty-diff/touched-file machinery stays as-is; the guard ships its own unfiltered parser).
- **No change to `isDenied`** semantics (it is *reused*, not modified — changing it has commit-cycle/run-cycle blast radius).
- No new env vars, no new external services, no README user-facing surface beyond the halt diagnostic.

## Implementation Approach
Keep the detection logic in a pure-leaning module so the parser, exclusion predicate, and formatter are unit-tested directly and only one thin function does subprocess I/O. Reuse `isDenied` for the `.claude`/`dist`/`node_modules`/`*.lock`/`cycle.pid` cases and layer guard-local `.cycle/**` and `docs/cycle/**` exclusion on top (the two engine-owned trees `isDenied` doesn't cover) — this is the "reuse where it fits, don't re-hand-code a parallel list" instruction resolved.

In `cli.ts`, thread an in-memory `pendingResidueContext` exactly as recon threads `pendingFailedResidueContext`: set it at each terminal-failure branch (resume terminal + the three loop branches), clear it on success/noop and whenever the guard finds a clean tree. The guard is a no-op when the context is unset, so it never fires on a clean post-success state. Route the residue halt's terminal `engine.stop` through a single emission by adding an `engineStopEmitted` flag the epilogue respects, preserving the existing single-`engine.stop` contract.

For the resume path, set `pendingResidueContext` from the log tail *before* the guard so the resume call is genuinely gated in-process (a prior process that left the in-flight cycle's tree dirty halts before resuming on top of it); a clean tree clears the context and resume proceeds unchanged.

## Failure & Resilience Decisions

**`readFailedCycleResidue(cwd)` — subprocess + parse (`failed-residue-guard.ts`)**
- **Failure modes**: `git status` exits non-zero (corrupt repo, not-a-repo, git missing) ⇒ **throw** `Error("git status --porcelain --untracked-files=all failed: " + (stderr || stdout))`. A non-zero status is never coerced to "clean" (an empty `paths` array). `spawnSync` `error` (ENOENT, git unresolvable) ⇒ `result.status` is `null` and `result.error` set ⇒ treated as non-zero ⇒ throw carrying `result.error.message`.
- **Idempotency**: read-only (`git status` mutates nothing); safe to call any number of times. The engine retries/restarts steps, but this function never writes — re-run is inherently safe.
- **Observability**: the throw propagates to the `cli.ts` guard, which converts it into a visible halt (`engine.halted` + stderr) — see below. The thrown message carries git's own stderr.
- **No silent failure**: the only non-throwing return path is a *successful* git invocation; emptiness means a genuinely clean (post-exclusion) tree, never a swallowed error.

**`cli.ts` guard wrapper `haltIfResidue()`**
- **Failure modes**: `readFailedCycleResidue` throws (git failure) ⇒ the guard catches it and **halts** rather than proceeding: emits `engine.halted { reason: "failed_cycle_dirty_worktree", message: "residue check failed: <err>", dirty_paths: [] }` + terminal `engine.stop` + stderr, returns halted. This satisfies "a failed status check must not be mistaken for no residue." Residue present ⇒ halt with the formatted diagnostic. Context unset or tree clean ⇒ return not-halted (clean path clears the context).
- **Idempotency**: the guard mutates only in-process supervisor state (`halted`, `haltReason`, `engineStopEmitted`, `pendingResidueContext`) and emits append-only JSONL events; it never touches the worktree. Re-entry on a subsequent loop iteration cannot occur after a halt (`halted` breaks the loop).
- **Observability**: every halt emits a structured `engine.halted` carrying `failed_cycle_id`, `issue_id`, `dirty_paths`, and `message`, plus the human diagnostic on `process.stderr`; the clean path emits nothing (preserving the "no new event on clean tree" acceptance).
- **No silent failure**: there is no code path where residue or a git error results in the engine silently proceeding to the next unit of work.

**`parseDirtyPaths`, `isEngineOwned`, `formatFailedCycleResidueDiagnostic`** — N/A — pure (string/array in-memory only).

---

## Task 1: Residue-detection + diagnostic module

### Overview
Create `src/engine/failed-residue-guard.ts` with the pure parser, exclusion predicate, formatter, and the single subprocess detector. No `cli.ts` wiring yet — this task is independently unit-testable.

### Changes Required
**File**: `src/engine/failed-residue-guard.ts` (new)
**Changes**:
```ts
import { spawnSync } from "node:child_process";
import { isDenied } from "./path-utils.ts";

export type ResidueContext = {
  cycleId: string;
  issueId: string;
  failingStep: string | undefined;
};

/** Unfiltered porcelain parse: every tracked change + every untracked path,
 *  rename/copy target only. Differs from run-cycle's src/scripts-filtered parser. */
export function parseDirtyPaths(snapshot: string): string[] {
  const paths = new Set<string>();
  for (const raw of snapshot.split("\n")) {
    if (!raw) continue;
    const xy = raw.slice(0, 2);
    if (xy === "??") { paths.add(raw.slice(3).replace(/^"/, "").replace(/"$/, "")); continue; }
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
 *  must never trip the guard. Reuses isDenied (path-utils) and layers the two
 *  engine trees it does not cover: .cycle/** and docs/cycle/**. */
export function isEngineOwned(p: string): boolean {
  const q = p.replace(/\/$/, "");
  if (isDenied(q)) return true;
  if (q === ".cycle" || q.startsWith(".cycle/")) return true;
  if (q === "docs/cycle" || q.startsWith("docs/cycle/")) return true;
  return false;
}

/** Read the worktree's dirty state, excluding engine-owned paths.
 *  THROWS on git non-zero — a failed check is never reported as clean. */
export function readFailedCycleResidue(cwd: string): { stdout: string; paths: string[] } {
  const r = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"],
    { cwd, encoding: "utf8", shell: false });
  if (r.status !== 0) {
    const detail = r.stderr || r.stdout || r.error?.message || `exit ${r.status}`;
    throw new Error(`git status --porcelain --untracked-files=all failed: ${detail}`);
  }
  const paths = parseDirtyPaths(r.stdout).filter((p) => !isEngineOwned(p));
  return { stdout: r.stdout, paths: [...new Set(paths)].sort() };
}

export function formatFailedCycleResidueDiagnostic(ctx: ResidueContext, dirtyPaths: string[]): string {
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
```

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean.
- [ ] `parseDirtyPaths` returns tracked + untracked + rename targets, deduped.
- [ ] `isEngineOwned` true for `.cycle/run.log`, `.cycle/engine.lock`, `.cycle/log.jsonl`, `docs/cycle/issues/todo/x.md`, `docs/cycle/0036-…/PLAN.md`, `node_modules/x`, `a.lock`; false for `src/server.ts`, `tests/x.test.ts`, `tmp/residue.txt`, `README.md`.
- [ ] `readFailedCycleResidue` throws on git non-zero (not return empty); returns sorted/deduped non-engine paths on success.
- [ ] Diagnostic names the cycle id, lists each dirty path, and states commit/stash/`git reset --hard` remediation.
- [ ] Failure paths behave as designed (throw on git failure, no silent empty return).

---

## Task 2: Wire the guard into the supervisor (both gated paths)

### Overview
Thread `pendingResidueContext` and run the guard before `runResumeOnce` and at the top of the `while (!halted)` loop, emitting the halt and preserving a single terminal `engine.stop`.

### Changes Required
**File**: `src/cli.ts`
**Changes**:
1. Import: `import { readFailedCycleResidue, formatFailedCycleResidueDiagnostic, type ResidueContext } from "./engine/failed-residue-guard.ts";`
2. Widen the union (`:276`): `let haltReason: "max_consecutive_failures" | "triage_failed" | "failed_cycle_dirty_worktree" | null = null;`
3. Add state near `:277`: `let pendingResidueContext: ResidueContext | undefined;` and `let engineStopEmitted = false;`
4. Guard helper (module-scope async, closes over `cwd`/`log`/`cyclesProcessed`):
```ts
async function haltIfResidue(): Promise<boolean> {
  if (!pendingResidueContext) return false;
  const ctx = pendingResidueContext;
  let dirty: { paths: string[] };
  try {
    dirty = readFailedCycleResidue(cwd);
  } catch (err) {
    const message = `Residue check failed after cycle ${ctx.cycleId}: ${(err as Error).message}`;
    await log.emit("engine.halted", {
      reason: "failed_cycle_dirty_worktree",
      failed_cycle_id: ctx.cycleId, issue_id: ctx.issueId, dirty_paths: [], message,
    });
    await log.emit("engine.stop", {
      status: "halted", dry_run: false, cycles_processed: cyclesProcessed,
      reason: "failed_cycle_dirty_worktree", halted_at_issue: ctx.issueId, failing_step: ctx.failingStep,
    });
    engineStopEmitted = true;
    process.stderr.write(message + "\n");
    return true;
  }
  if (dirty.paths.length === 0) { pendingResidueContext = undefined; return false; }
  const message = formatFailedCycleResidueDiagnostic(ctx, dirty.paths);
  await log.emit("engine.halted", {
    reason: "failed_cycle_dirty_worktree",
    failed_cycle_id: ctx.cycleId, issue_id: ctx.issueId, dirty_paths: dirty.paths, message,
  });
  await log.emit("engine.stop", {
    status: "halted", dry_run: false, cycles_processed: cyclesProcessed,
    reason: "failed_cycle_dirty_worktree", halted_at_issue: ctx.issueId, failing_step: ctx.failingStep,
  });
  engineStopEmitted = true;
  process.stderr.write(message + "\n");
  return true;
}
```
5. **Resume-site gating** (`:504–528`): inside `if (tail)`, after `activeCycleId = tail.cycleId;`, set context from the tail and run the guard before resuming:
```ts
pendingResidueContext = { cycleId: tail.cycleId, issueId: tail.issueId, failingStep: undefined };
if (await haltIfResidue()) { halted = true; haltReason = "failed_cycle_dirty_worktree"; }
else {
  pendingResidueContext = undefined;
  const result = await runResumeOnce(...);   // existing body unchanged
  // ... existing accounting; in the `terminal` branch add:
  //   pendingResidueContext = { cycleId: tail.cycleId, issueId: result.issueId!, failingStep: result.failingStep };
  // in the `ok` / `noop` branches: pendingResidueContext = undefined;
}
activeCycleId = undefined;
```
6. **Loop-top gating** (`:531`): first statement inside `while (!halted)`:
```ts
if (await haltIfResidue()) { halted = true; haltReason = "failed_cycle_dirty_worktree"; break; }
```
7. **Set context at each loop terminal branch** (after `recordTerminalFailure` at `:619`, `:672`, `:692`): `pendingResidueContext = { cycleId, issueId: row.id, failingStep: <"commit"|failingStep> };`. **Clear** it in the success block (`:636–643`) and the noop block: `pendingResidueContext = undefined;`.
8. **Single `engine.stop`** (epilogue `:721`): wrap in `if (!engineStopEmitted) { await log.emit("engine.stop", { ... }); }`. The max-consecutive `engine.halted` (`:713`) is already reason-gated and unaffected.

### Success Criteria
- [ ] Builds; `npm run typecheck` clean.
- [ ] Residue after a loop terminal failure ⇒ exactly one `engine.halted{failed_cycle_dirty_worktree}` before the next `popNextPending`; exactly one terminal `engine.stop`; `process.exit(1)`.
- [ ] Residue present when resuming an in-flight tail ⇒ halt before `runResumeOnce` runs.
- [ ] Clean tree ⇒ no new event; existing retry / max-consecutive behavior unchanged.
- [ ] No double `engine.stop` (cardinality-pinned in tests).
- [ ] Failure paths behave as designed (git-failure halt, no silent proceed).

---

## Task 3: Unit tests for the module

### Overview
Direct `node:test` coverage of the four exports using real temp git repos and pure-function assertions.

### Changes Required
**File**: `tests/engine/failed-residue-guard.test.ts` (new)
**Changes**:
- `parseDirtyPaths`: `??` untracked anywhere kept; ` M`/`MM` tracked kept; `R  old -> new` keeps `new`; quoted paths unquoted; blank lines skipped; dedupe.
- `isEngineOwned`: table test over the engine-owned and non-engine paths from Task 1 criteria.
- `readFailedCycleResidue`: real `mkdtemp` + `git init -b main` + config + initial commit; write `src/server.ts` (untracked) and a `docs/cycle/issues/todo/x.md` (engine-owned) ⇒ result paths == `["src/server.ts"]`, sorted/deduped. Multiple non-engine dirty files ⇒ sorted+deduped. Clean repo ⇒ `[]`.
- Git-failure throw: run against a non-repo temp dir (or a dir where `git status` exits non-zero) ⇒ `assert.throws(() => readFailedCycleResidue(dir), /git status .* failed/)`. (Prefer the real non-zero-exit path over mocking; per CLAUDE.md `node:fs` is the only `mock.method`-able fs module — not needed here.)
- `formatFailedCycleResidueDiagnostic`: asserts the cycle id, every `- <path>` bullet, and the literal `git reset --hard` / `git stash` / commit wording appear.

### Success Criteria
- [ ] All assertions pass under `node --test --experimental-strip-types`.
- [ ] Real temp git repos used (no heavy mocking).
- [ ] Module meets its per-file coverage floor (Task 5).

---

## Task 4: Supervisor-level tests (both gated paths + failure + clean)

### Overview
Drive the built `dist/cycle.js` against a temp repo via the `tests/cli/halt.test.ts` harness, mirroring recon's contract adapted to `node:test`.

### Changes Required
**File**: `tests/cli/failed-residue-guard.test.ts` (new), reusing `ensureDist`/`bootstrapRepo`/`seedTodo`/`workflowYml`/`verifyScript`/`readEvents` (import or replicate from `halt.test.ts`).
**Changes**:
- **Loop path (acceptance a/b)**: workflow with `max_cycle_attempts: 1`, `max_consecutive_failures: 2`. The failing bash step writes an uncommitted `src/residue.ts` (or `tmp/residue.txt`) and exits 1. Run `node dist run`. Assert `readEvents(...).filter(e => e.event === "engine.halted" && e.reason === "failed_cycle_dirty_worktree").length === 1` (fires at `consecutiveFailures === 1`, i.e. before max-consecutive); assert the next issue was **not** popped; exit code 1.
- **User-benefit payload**: assert the matched `engine.halted` payload `dirty_paths` includes the residue path and `failed_cycle_id` equals the failed cycle; assert captured stderr contains the path, the cycle id, and `git reset --hard`.
- **Resume path (acceptance a)**: pre-seed `.cycle/log.jsonl` with a `cycle.start` (no `cycle.end`) so `readLogTail` returns an in-flight cycle, leave an uncommitted `src/residue.ts` in the worktree, run `node dist run`. Assert exactly one `engine.halted{failed_cycle_dirty_worktree}` fires **before** any `engine.resume` event for that cycle.
- **Engine-owned-only residue**: failing step touches only `docs/cycle/issues/...` / `.cycle/run.log` ⇒ assert **no** `failed_cycle_dirty_worktree` halt (normal terminal-failure path).
- **Clean tree**: failing step writes nothing ⇒ assert no `failed_cycle_dirty_worktree` event; existing terminal-failure/retry events unchanged; exactly one `engine.stop`.
- **Git-failure**: simulate by making `git status` fail in the residue window (e.g. point the guard at a path that is not a git repo, or corrupt `.git` after the failure) ⇒ assert the engine halts (emits `engine.halted{failed_cycle_dirty_worktree}` carrying the failure message) and does **not** silently proceed/exit 0.
- Cardinality-pin every halt assertion with `filter(...).length === 1` or `expectExactlyOne`; assert exactly one terminal `engine.stop`.

### Success Criteria
- [ ] Both gated paths halt exactly-once with the new reason.
- [ ] Engine-owned-only and clean-tree cases do **not** halt.
- [ ] Git-failure case halts (no silent proceed).
- [ ] Single `engine.stop`; existing `tests/cli/resume.test.ts` and `tests/cli/halt.test.ts` still green (verify their temp repos are clean-after-exclusion at resume time; adjust the new guard's exclusion only if a real engine-owned tree is implicated — do not weaken it for genuine `src/` residue).

---

## Task 5: Coverage floor, structural invariant, docs

### Overview
Register the new module's floor and a call-site invariant; update `CLAUDE.md` and `docs/ENGINE.md`.

### Changes Required
**File**: `scripts/coverage-gate.mjs` — add to `FLOORS`: `"src/engine/failed-residue-guard.ts": 100,` (pure-leaning module, matching `path-utils`/`halt-accounting`/`noop-marker`). If the `spawnSync` throw branch proves hard to fully cover, set the floor to 95 and state why in the report.

**File**: `scripts/structural-invariants.mjs` — add to `INVARIANTS`:
```js
{ file: 'src/cli.ts', pattern: /haltIfResidue\(\)/g, expected: 2,
  reason: 'failed-cycle residue guard wired at exactly two gated sites: before runResumeOnce and at loop-top (cycle 0036)' },
```

**File**: `CLAUDE.md` — add `failed_cycle_dirty_worktree` to the halt-reason / Workflow-defaults documentation (the guard, the two gated paths, the engine-owned `.cycle/**`+`docs/cycle/**`+`isDenied` exclusion, the trunk-mode rationale, the git-status-failure-halts behavior, and the not-yet-implemented cross-process startup re-check); add `src/engine/failed-residue-guard.ts` to the Architecture module list.

**File**: `docs/ENGINE.md` — add a *Failed-cycle dirty-worktree residue guard* subsection under halt policy (`:56–58`): detection (`git status --porcelain --untracked-files=all`, throw on non-zero), scoping/exclusion, the `engine.halted`/`engine.stop` event schema and single-`engine.stop` contract, both gated paths, the in-memory `pendingResidueContext` (no persistence this cycle), and the recon-parity retry gap.

**File**: `README.md` — no change (state explicitly in `BUILD.md`/reflection that no user-facing surface beyond the halt diagnostic exists).

### Success Criteria
- [ ] `npm run check:coverage` passes with the new floor; aggregate coverage does not decrease (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%).
- [ ] `npm run check:invariants` passes (exactly two `haltIfResidue()` call-sites).
- [ ] Docs reflect the new halt reason, both paths, exclusion, and failure behavior.
- [ ] Failure paths documented, not just code (`git status` failure ⇒ halt).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] A failed cycle that leaves an uncommitted non-engine file in the worktree causes the engine to halt **before** resuming/retrying that cycle, emitting `engine.halted { reason: "failed_cycle_dirty_worktree" }` (asserted with `filter(...).length === 1`). | Task 2, Task 4 | Resume-site + loop-top gating; cardinality-pinned resume-path test. |
| [ ] A failed cycle that leaves residue causes the engine to halt **before** popping the next pending issue (the next-issue loop path is gated), asserted exactly-once. | Task 2, Task 4 | Loop-top guard precedes `popNextPending`; exactly-once assertion. |
| [ ] **User-observable benefit**: the emitted `engine.halted` event payload and the stderr diagnostic both name the dirty residue paths and the failed cycle id, and the diagnostic states the commit/stash/reset remediation — verifiable by asserting on the captured event payload and stderr text. | Task 1, Task 2, Task 4 | `dirty_paths`/`failed_cycle_id` in payload; `formatFailedCycleResidueDiagnostic` carries paths + cycle id + commit/stash/`git reset --hard`; asserted on payload and stderr. |
| [ ] **Failure-path criterion**: when `git status --porcelain` exits non-zero, the detector raises an error (it does not report a clean tree); a test injects a git failure and asserts the engine does not silently proceed as if clean. | Task 1, Task 2, Task 3, Task 4 | `readFailedCycleResidue` throws on non-zero; guard converts throw to a visible halt; module + supervisor tests cover it. |
| [ ] A failed cycle whose only residue is engine-owned runtime state (`.cycle/log.jsonl`, `.cycle/tbd.jsonl`, etc.) does **not** trip the guard — the engine proceeds normally (asserted: no `failed_cycle_dirty_worktree` halt). | Task 1, Task 4 | `isEngineOwned` excludes `.cycle/**`+`docs/cycle/**`+`isDenied`; engine-owned-only supervisor test asserts no halt. |
| [ ] A clean tree after a failed cycle leaves the existing failure/retry/`max_consecutive_failures` behavior byte-for-byte unchanged (no new event emitted). | Task 2, Task 4 | Clean path emits nothing and clears context; clean-tree test asserts unchanged events + single `engine.stop`. |
| [ ] New module meets its per-file coverage floor; overall coverage does not decrease (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%). | Task 3, Task 5 | Floor added to `FLOORS`; module unit tests drive 100%. |
| [ ] All existing tests still pass. | Task 2, Task 4 | `npm test` green; resume/halt suites re-verified against the new resume-site gating. |
| [ ] No compiler/linter warnings introduced (`npm run typecheck` clean). | Task 1, Task 2 | Union widened; typed imports; `tsc --noEmit` clean. |

---

## Testing Strategy

### Unit Tests
- **`parseDirtyPaths`**: untracked-anywhere, tracked-modified, rename target extraction, quoted-path unquoting, blank-line skip, dedupe.
- **`isEngineOwned`**: positive (`.cycle/run.log`, `.cycle/engine.lock`, `.cycle/log.jsonl`, `docs/cycle/issues/todo/*.md`, `docs/cycle/0036-…/PLAN.md`, `node_modules/*`, `*.lock`) and negative (`src/*`, `tests/*`, `tmp/residue.txt`, `README.md`).
- **`readFailedCycleResidue`** (real temp git repos): mixed engine-owned + non-engine dirty ⇒ only non-engine, sorted/deduped; clean ⇒ `[]`.
- **Failure-path tests**: `readFailedCycleResidue` against a non-git dir ⇒ throws `/git status .* failed/` (exercises the non-zero-exit branch — the named git-failure failure mode).
- **`formatFailedCycleResidueDiagnostic`**: cycle id, per-path bullets, and commit/stash/`git reset --hard` wording present.
- **Mocking strategy**: real temp git repos throughout; no fs mocking needed. (If a deterministic git-failure injection is required, prefer a real non-repo dir over `mock.method`; `node:fs/promises` is non-stubbable per CLAUDE.md.)

### Integration / E2E Tests
- Supervisor tests (Task 4) spawn the built `dist/cycle.js run` against temp trunk-mode repos: loop-path halt (before next pop), resume-path halt (before `runResumeOnce`), engine-owned-only no-halt, clean-tree no-halt, git-failure halt. All halt assertions cardinality-pinned; single terminal `engine.stop` verified. No UI surface ⇒ no Playwright/E2E.

## Risk Assessment
- **Resume-site gating breaks existing resume tests**: if any `tests/cli/resume.test.ts` scenario leaves a non-engine uncommitted file at resume time, the new guard would halt it. *Mitigation*: the exclusion covers all engine-managed trees (`.cycle/**`, `docs/cycle/**`); run the full suite and inspect any newly-halting resume test — only widen exclusion for a genuinely engine-owned path, never for real `src/` residue.
- **Exclusion too broad hides real residue**: excluding all of `docs/cycle/**` means half-written *artifact* docs won't trip the guard. *Mitigation*: this is intended — the SPEC danger is half-applied **source** edits (`src/`/`scripts/`/`tests/`), which remain caught; artifact docs are engine workflow output committed by `commitCycle` on success.
- **Double `engine.stop`**: the epilogue always emits one. *Mitigation*: `engineStopEmitted` flag gates the epilogue; tests assert exactly one terminal `engine.stop` on the residue-halt path.
- **Retry-path residue gap (recon parity)**: a within-budget `drainRetry` is not residue-gated, so attempt N+1 can run on attempt N's residue before the terminal failure finally halts. *Mitigation*: documented as a known recon-parity limitation in `docs/ENGINE.md`; closing it is out of scope this cycle.
- **`.gitignore` drift**: mainline ignores some `.cycle/*` files but not `.cycle/run.log`/`.cycle/engine.lock`. *Mitigation*: the guard's `isEngineOwned` excludes the whole `.cycle/` tree, so it does not depend on `.gitignore` coverage.
