# Implementation Plan: Cycle 0039

## Overview
Close the cross-process gap in the failed-cycle dirty-worktree residue guard by persisting the in-memory `pendingResidueContext` to `.cycle/failed-residue-context.json` at every terminal-failure branch, re-checking the worktree against that persisted context exactly once at engine start (before triage and the resume/loop work), and clearing the file on the same success/noop/clean-tree transitions that clear the in-memory copy — so the guard's durability guarantee holds across a full engine restart, the normal AFK recovery path.

## Current State (from Research)

- **Guard core** (`src/engine/failed-residue-guard.ts`, 100% coverage floor): `ResidueContext = { cycleId; issueId; failingStep: string | undefined }`, `readFailedCycleResidue(cwd)` (runs `git status --porcelain --untracked-files=all`, **throws** on non-zero, filters `isEngineOwned`), `isEngineOwned` (excludes all of `.cycle/**`, so the new state file can never trip the guard), and `formatFailedCycleResidueDiagnostic`. **Reused unchanged.**
- **Supervisor** (`src/cli.ts`): in-memory `pendingResidueContext` and `engineStopEmitted` declared at `:292-293`; `haltIfResidue()` (`:527-547`, no-op when context unset; clean tree clears context + returns false; residue or git-status failure emits halt + returns true); `emitResidueHalt()` (`:549-571`, emits exactly one `engine.halted` + one terminal `engine.stop`, sets `engineStopEmitted`, writes diagnostic to stderr).
- **Bootstrap order** (`src/cli.ts:184-266`): `acquireLock` → logger → SIGTERM handlers → issue-dir mkdirs → `loadDotEnv`+`loadConfig` (`:217`) → `engine.start` (`:223`) → preflight gate (`:225-253`, halts via direct `process.exit(1)`) → `runTriage` (`:255`). Resume-from-tail block at `:573`; `while (!halted)` loop at `:617`.
- **Set sites (terminal-failure branches)** that arm `pendingResidueContext`: resume terminal `:598`, commit-failed terminal `:725`, fast-bail terminal `:780`, attempts-exhausted terminal `:804`. The within-budget retry arm `:792` and the resume-from-tail arm-from-tail `:580` also assign the context but are **not** terminal failures.
- **Clear sites** (`pendingResidueContext = undefined`): resume-ok `:591`, resume-noop `:606`, resume-skipped/retry `:609`, clean-tree inside `haltIfResidue` `:541`, noop drain `:699`, success drain `:741`.
- **Patterns to follow**: atomic tmp+rename write (`src/engine/queue.ts:122-126`); tolerant read with ENOENT degrade + injectable seam (`src/engine/dot-env.ts:8-36`); small `src/engine/` state-helper module with default-deps seam and `node:fs` sync calls (`src/engine/engine-lock.ts`); `engine.warning` precedent (`src/cli.ts:695`, `noop_reason_unreadable`); cardinality pin `filter(...).length === 1`. `node:fs/promises` cannot be `mock.method`-stubbed — use `node:fs` sync exports.

## Desired End State

- A new module `src/engine/residue-context-store.ts` reads/writes/deletes `.cycle/failed-residue-context.json` tolerantly (missing ⇒ none; corrupt/unreadable ⇒ corrupt-degrade; atomic write).
- `src/cli.ts` persists the context file at the four terminal-failure branches, deletes it at every clear transition, and runs a startup re-check (after `engine.start`/preflight, before triage and resume) that loads a present file into `pendingResidueContext` and routes through the unchanged `haltIfResidue()`.
- A fresh engine process started after a terminal-failure cycle that left residue halts at startup with exactly one `engine.halted {reason:"failed_cycle_dirty_worktree", …}` + terminal `engine.stop` + stderr diagnostic + non-zero exit, **before** any `cycle.start` or triage. A clean restart deletes the file and proceeds. A malformed file emits `engine.warning {reason:"residue_context_unreadable"}` and proceeds.
- `docs/ENGINE.md` and `CLAUDE.md` state that cross-process persistence is implemented; the "in-process only / sole remaining recon-parity gap" caveat is removed.
- **Verify**: `npm run test:coverage` (new module at 100% floor) and `npm run typecheck` clean; integration tests in `tests/cli/failed-residue-guard.test.ts` cover startup halt, clean restart, malformed, git-status failure; unit tests in `tests/engine/residue-context-store.test.ts` cover round-trip/missing/malformed/delete-missing.

## What We're NOT Doing

- **Not** changing `readFailedCycleResidue` / `parseDirtyPaths` / `isEngineOwned` / `formatFailedCycleResidueDiagnostic` / `emitResidueHalt` / `haltIfResidue` *semantics* — only adding a clean-tree file-delete call inside `haltIfResidue`'s existing clean branch.
- **Not** persisting at the within-budget `drainRetry` arm (`src/cli.ts:792`). SPEC scopes persistence to terminal-failure branches; the retry arm is an in-process gate (cycle 0038) and is explicitly Out of Scope. A residual cross-process gap for within-budget-retry residue remains and is **not** closed here (called out below).
- **Not** persisting at the resume-from-tail arm (`src/cli.ts:580`) — that path is driven by the in-flight log tail on the next restart, which re-arms it; it is not a terminal-failure branch.
- **Not** migrating any other in-memory supervisor state to disk.
- **Not** adding a CLI command or any user-facing README surface change.

## Implementation Approach

A small, pure-leaning store module (mirroring `engine-lock.ts` / `dot-env.ts`) owns the file I/O with a default-deps seam over `node:fs` sync functions, returning a discriminated read result (`none` / `ok` / `corrupt`) so the caller — never the module — decides policy. In `src/cli.ts`, two thin best-effort wrappers (`persistResidue` / `unpersistResidue`) manage the file without touching `pendingResidueContext`; they are called *adjacent to* the existing in-memory assignments so the file stays in lock-step with memory and each call site is SPEC-traceable. The clean-tree file delete is folded into `haltIfResidue`'s existing clean branch so all three clean-tree clears (startup, resume, loop-top) delete consistently. The startup re-check reuses `haltIfResidue()`/`emitResidueHalt()` verbatim for byte-identical payloads and exits directly via `process.exit(1)` on halt — matching the existing preflight bootstrap-halt pattern (`src/cli.ts:250`).

**Declaration relocation (required).** The startup re-check must run before triage (`:255`), but `cyclesProcessed` (`:277`), `pendingResidueContext`, and `engineStopEmitted` (`:292-293`) are declared *after* it and are read by `haltIfResidue`/`emitResidueHalt`. These three `let` declarations (plus a `const residueContextPath`) are relocated above the preflight/triage region (immediately after the `engine.start` emit at `:223`) to avoid a temporal-dead-zone `ReferenceError`. All other loop-state declarations stay put.

## Failure & Resilience Decisions

**Task 1 — `residue-context-store.ts` write (`writeResidueContext`)**
- *Failure modes*: a `writeFileSync`/`renameSync` failure (EACCES, ENOSPC) throws to the caller. The caller wrapper (`persistResidue`, Task 2) catches and emits `engine.warning {reason:"residue_context_write_failed"}`, then proceeds in-memory-only — the terminal-failure routing is never masked.
- *Idempotency*: fully idempotent — atomic tmp+rename overwrites any prior file; re-running with the same context yields the same file. A crash between `writeFileSync(tmp)` and `renameSync` leaves only `…json.tmp` (engine-owned, ignored by the read path and `isEngineOwned`), never a half-written live file.
- *Observability*: write failure surfaces as `engine.warning` with `cycle_id`/`issue_id`/`error`.
- *No silent failure*: the module rethrows; the wrapper converts to a logged warning. Never swallowed.

**Task 1 — read (`readResidueContext`)**
- *Failure modes*: missing file (ENOENT) ⇒ `{status:"none"}`; any other read error (EACCES) or JSON parse error or shape-validation failure ⇒ `{status:"corrupt", error}`. Never throws.
- *Idempotency*: pure read, safe to re-run.
- *Observability*: caller emits `engine.warning {reason:"residue_context_unreadable"}` on `corrupt`.
- *No silent failure*: a corrupt file is reported via warning (distinct from the `git status` non-zero halt path); it degrades to "no pending context" rather than crashing startup, per SPEC rationale (a corrupt file cannot attribute residue to a cycle, and the next terminal failure re-arms).

**Task 1 — delete (`deleteResidueContext`)**
- *Failure modes*: ENOENT swallowed (already absent ⇒ success); any other `unlinkSync` error rethrows.
- *Idempotency*: idempotent — deleting an absent file is a no-op.
- *Observability*: caller wrapper (`unpersistResidue`) catches rethrown errors and emits `engine.warning {reason:"residue_context_delete_failed"}`.
- *No silent failure*: non-ENOENT errors surface as a logged warning; a stale file at worst causes one redundant clean-tree re-check next start (which deletes it).

**Task 2 — cli.ts persist/clear wiring**
- *Failure modes*: delegated to the store; both wrappers are best-effort (catch → warn → continue). A persist failure falls back to in-memory-only behavior for that run; a delete failure leaves a stale file that is harmless.
- *Idempotency*: the engine retries/restarts steps — re-running a terminal-failure branch re-writes the same file (idempotent); re-running a clear deletes an already-absent file (idempotent).
- *Observability*: `residue_context_write_failed` / `residue_context_delete_failed` warnings.
- *No silent failure*: every catch emits a warning; nothing swallowed.

**Task 3 — startup re-check**
- *Failure modes*: missing file ⇒ proceed (no event); corrupt file ⇒ `engine.warning` + delete the unusable file + proceed; valid file + residue ⇒ `engine.halted` + terminal `engine.stop` + stderr + `process.exit(1)`; valid file + `git status` non-zero ⇒ halt with `dirty_paths:[]` + "Residue check failed" message (via `haltIfResidue`'s unchanged catch arm); valid file + clean tree ⇒ `haltIfResidue` clears context and deletes file, proceed.
- *Idempotency*: runs exactly once per process; reading is pure; on clean tree the file is deleted so the next restart sees `none`; on halt the file persists for the operator to remediate, and the post-remediation restart finds a clean tree and deletes it.
- *Observability*: reuses `emitResidueHalt` (identical payloads + `engineStopEmitted` suppression) so the startup halt is indistinguishable from the in-process gate in the log.
- *No silent failure*: a `git status` failure halts (never coerced to clean); a corrupt file warns; only a genuinely-absent file is a silent proceed (the intended clean-restart case).

**Task 4 — docs** : N/A — pure documentation.

---

## Task 1: Add the residue-context persistence module

### Overview
A self-contained `src/engine/residue-context-store.ts` that atomically writes, tolerantly reads, and idempotently deletes `.cycle/failed-residue-context.json`, mirroring the `engine-lock.ts`/`dot-env.ts` module shape with a default-deps seam over `node:fs` sync functions (for `mock.method` fault tests).

### Changes Required

**File**: `src/engine/residue-context-store.ts` (new)
**Changes**:
```ts
import { readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import type { ResidueContext } from "./failed-residue-guard.ts";

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

/** Atomic tmp+rename write (queue.ts idiom) — a crash mid-write leaves only `.tmp`. */
export function writeResidueContext(
  path: string, ctx: ResidueContext, deps: ResidueStoreDeps = defaultDeps,
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

/** Missing ⇒ none; unreadable/unparseable/wrong-shape ⇒ corrupt; never throws. */
export function readResidueContext(
  path: string, deps: ResidueStoreDeps = defaultDeps,
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
  if (!isValidContext(parsed)) return { status: "corrupt", error: "missing or invalid required fields" };
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

/** ENOENT swallowed (idempotent); other errors rethrow for the caller to log. */
export function deleteResidueContext(path: string, deps: ResidueStoreDeps = defaultDeps): void {
  try {
    deps.unlinkSync(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}
```

**File**: `scripts/coverage-gate.mjs`
**Changes**: add to the `FLOORS` table (after the sibling guard entry at `:36`):
```js
  "src/engine/residue-context-store.ts": 100,
```

### Success Criteria
- [ ] Compiles/builds cleanly (`npm run build`, `npm run typecheck`)
- [ ] Unit tests pass: write→read round-trip; missing ⇒ `none`; malformed JSON ⇒ `corrupt` (no throw); non-ENOENT read error ⇒ `corrupt`; wrong-shape JSON ⇒ `corrupt`; delete-missing ⇒ no throw
- [ ] New module meets its 100% per-file coverage floor
- [ ] Failure paths behave as designed: read never throws; delete swallows only ENOENT and rethrows others

---

## Task 2: Wire persist/clear into the cli.ts in-memory set/clear sites

### Overview
Relocate the residue-guard state declarations above the preflight/triage region, add two best-effort file wrappers, fold a clean-tree delete into `haltIfResidue`, and call `persistResidue`/`unpersistResidue` adjacent to every SPEC-designated terminal-failure set site and clear site.

### Changes Required

**File**: `src/cli.ts`

**(a) Imports** — extend the existing store-sibling import region (`:30-34`):
```ts
import {
  writeResidueContext,
  readResidueContext,
  deleteResidueContext,
} from "./engine/residue-context-store.ts";
```

**(b) Relocate declarations** — move these out of `:277`/`:292-293` to immediately after the `engine.start` emit (`:223`), and add the path const:
```ts
const residueContextPath = join(cwd, ".cycle", "failed-residue-context.json");
let cyclesProcessed = 0;
// Failed-cycle dirty-worktree residue guard (cycle 0036; cross-process persistence 0039) …
let pendingResidueContext: ResidueContext | undefined;
let engineStopEmitted = false;
```
Remove the now-duplicate declarations at their old locations.

**(c) Best-effort file wrappers** — add near `haltIfResidue` (hoisted `async function` declarations):
```ts
async function persistResidue(ctx: ResidueContext): Promise<void> {
  try {
    writeResidueContext(residueContextPath, ctx);
  } catch (err) {
    await log.emit("engine.warning", {
      reason: "residue_context_write_failed",
      cycle_id: ctx.cycleId, issue_id: ctx.issueId, error: (err as Error).message,
    });
  }
}
async function unpersistResidue(): Promise<void> {
  try {
    deleteResidueContext(residueContextPath);
  } catch (err) {
    await log.emit("engine.warning", {
      reason: "residue_context_delete_failed", error: (err as Error).message,
    });
  }
}
```

**(d) Clean-tree delete inside `haltIfResidue`** (`:540-543`):
```ts
  if (dirtyPaths.length === 0) {
    pendingResidueContext = undefined;
    await unpersistResidue();   // delete persisted file on every clean-tree clear (startup/resume/loop)
    return false;
  }
```

**(e) Persist at the four terminal-failure set sites** — add `await persistResidue(...)` immediately after the existing assignment:
- `:598` resume terminal: `pendingResidueContext = { cycleId: tail.cycleId, issueId: result.issueId!, failingStep: result.failingStep };` → `await persistResidue(pendingResidueContext);`
- `:725` commit-failed terminal: after `pendingResidueContext = { cycleId, issueId: row.id, failingStep: "commit" };`
- `:780` fast-bail terminal: after `pendingResidueContext = { cycleId, issueId: row.id, failingStep };`
- `:804` attempts-exhausted terminal: after `pendingResidueContext = { cycleId, issueId: row.id, failingStep };`

(Leave `:580` resume-from-tail arm and `:792` within-budget retry arm **unchanged** — not terminal-failure branches.)

**(f) Delete at the clear sites that are not already covered by (d)** — add `await unpersistResidue()` after each `pendingResidueContext = undefined`:
- `:591` resume-ok, `:606` resume-noop, `:609` resume-skipped/retry, `:699` noop drain, `:741` success drain.

(The clean-tree clear at `:541` is covered by change (d); do not double-call.)

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean
- [ ] After a terminal-failure branch executes, `.cycle/failed-residue-context.json` exists with `cycleId`/`issueId` matching the failed cycle (integration assertion)
- [ ] After a success or noop drain, the file is absent
- [ ] No TDZ `ReferenceError` at startup (relocated declarations precede first use)
- [ ] Failure paths: write/delete failures emit `engine.warning` and never crash the supervisor or mask terminal routing

---

## Task 3: Add the startup re-check before triage and resume

### Overview
After `engine.start`/preflight and before the triage block (`:255`), read the persisted context; on `ok` arm `pendingResidueContext` and run `haltIfResidue()` (halt+exit on residue/git-failure, file-delete+proceed on clean); on `corrupt` warn, delete the unusable file, and proceed; on `none` proceed silently.

### Changes Required

**File**: `src/cli.ts` — insert immediately before `if (cfg) { const triageResult = await runTriage… }` (`:255`):
```ts
// Cross-process residue re-check (cycle 0039): a terminal-failure cycle in a prior
// process persisted its context but left no in-flight log tail. Re-check the worktree
// once at startup — before triage and the resume/loop work — so a fresh process never
// stacks a new cycle on residue. Reuses haltIfResidue()/emitResidueHalt() for
// byte-identical payloads + the engineStopEmitted single-engine.stop contract.
{
  const persisted = readResidueContext(residueContextPath);
  if (persisted.status === "corrupt") {
    await log.emit("engine.warning", {
      reason: "residue_context_unreadable", error: persisted.error,
    });
    await unpersistResidue(); // drop the unusable file so we don't re-warn every start
  } else if (persisted.status === "ok") {
    pendingResidueContext = persisted.ctx;
    if (await haltIfResidue()) {
      // emitResidueHalt already fired engine.halted + terminal engine.stop + stderr.
      process.exit(1);
    }
    // clean tree: haltIfResidue cleared the context and deleted the now-stale file.
  }
}
```

### Notes on ordering / interaction with resume-from-tail
- Runs after `engine.start`/preflight and before triage (`:255`) and the resume block (`:573`), satisfying "before any new work is dispatched."
- A terminal-failure cycle has `cycle.end {status:"failed"}` in the log ⇒ `readLogTail` returns no tail, so the resume block does not run; the persisted file is the only arming source — exactly the gap this closes.
- If both a persisted file and an in-flight tail exist (rare crash interleaving): startup wins — dirty ⇒ halt; clean ⇒ file deleted + context cleared, then the resume block re-arms from the tail and proceeds normally. No double-arm or conflicting halt.
- Not gated on `cfg` — residue is a worktree property independent of config; matches preflight's direct-`process.exit(1)` bootstrap-halt style.

### Success Criteria
- [ ] Fresh process + persisted file + dirty tree ⇒ exactly one `engine.halted {reason:"failed_cycle_dirty_worktree", failed_cycle_id, issue_id, dirty_paths}`, terminal `engine.stop`, stderr diagnostic, non-zero exit, and **no** `cycle.start`/triage after it
- [ ] Persisted file + clean tree ⇒ no residue `engine.halted`; file deleted; engine proceeds
- [ ] Malformed file ⇒ `engine.warning {reason:"residue_context_unreadable"}`, no throw, no residue halt, engine proceeds
- [ ] `git status` non-zero during startup re-check ⇒ halt with `dirty_paths: []` and "Residue check failed" message
- [ ] `typecheck` clean; cardinality of startup `engine.halted`/`engine.stop` pinned with `filter(...).length === 1`

---

## Task 4: Update documentation (caveat removal)

### Overview
Correct the "in-process only / sole remaining recon-parity gap" caveat in `docs/ENGINE.md` and `CLAUDE.md` to document the implemented cross-process persistence.

### Changes Required

**File**: `docs/ENGINE.md` (*Failed-cycle dirty-worktree residue guard* section, `:60-72`)
**Changes**: rewrite the final "Out of scope / known gaps" paragraph (`:72`) to remove the cross-process caveat and add a paragraph documenting: the `.cycle/failed-residue-context.json` state file (engine-owned, atomic tmp+rename write, JSON `{cycleId, issueId, failingStep}`); the **third (startup) check site** running after `engine.start`/preflight and before triage/resume; the persist-at-terminal-failure / delete-on-success/noop/clean-tree lifecycle; and the malformed-file degrade (`engine.warning {reason:"residue_context_unreadable"}` ⇒ proceed, distinct from the `git status` non-zero halt). Note the remaining out-of-scope item: the within-budget-retry arm is not persisted (in-process gate only).

**File**: `CLAUDE.md` (*Failed-cycle dirty-worktree residue guard* bullet)
**Changes**: replace the sentence "The sole remaining recon-parity gap is cross-process persistence of the residue context across full engine restarts (recon's `.cycle/failed-residue-context.json` startup re-check), which is **not** implemented (in-process only)." with a description of the implemented startup re-check: persist `pendingResidueContext` to `.cycle/failed-residue-context.json` at terminal-failure branches, re-check once at engine start (before triage/resume), clear on success/noop/clean-tree, malformed ⇒ degrade-with-warning. Reference cycle 0039.

### Success Criteria
- [ ] No "not implemented this cycle / in-process only / sole remaining recon-parity gap" phrasing remains for cross-process persistence
- [ ] Both docs describe the state file, the startup check site, the persist/clear lifecycle, and the malformed-file degrade
- [ ] `README.md` unchanged (internal durability behavior, no CLI surface)

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] **(User-observable benefit)** After a terminal-failure cycle leaves uncommitted residue, a fresh engine process (no in-flight log tail) reads `.cycle/failed-residue-context.json`, halts at startup with exactly one `engine.halted {reason:"failed_cycle_dirty_worktree", failed_cycle_id, issue_id, dirty_paths}`, writes the remediation diagnostic to stderr, and exits non-zero **before** any `cycle.start` or triage — verified by a test asserting `events.filter(e => e.event === "engine.halted" && e.reason === "failed_cycle_dirty_worktree").length === 1` and no `cycle.start` after it. | Task 3 | Startup re-check + `emitResidueHalt`; integration test |
| [ ] On a terminal-failure branch, `.cycle/failed-residue-context.json` is written with the failed cycle id and issue id (verified by reading the file after the branch executes). | Task 1, Task 2 | `writeResidueContext` + `persistResidue` at the four terminal set sites |
| [ ] On a clean restart (state file present, worktree clean), the engine proceeds normally, emits no residue `engine.halted`, and the state file is deleted (verified by asserting the file is absent after startup). | Task 3, Task 2 | Clean-tree branch of `haltIfResidue` deletes via `unpersistResidue` |
| [ ] On success/noop transitions that clear `pendingResidueContext`, the persisted state file is also deleted. | Task 2 | `unpersistResidue` at success drain (`:741`) and noop drain (`:699`) |
| [ ] **(Failure-path)** A present-but-malformed `.cycle/failed-residue-context.json` does not crash startup: the engine emits an `engine.warning` (reason indicating the context was unreadable), treats it as no pending context, and proceeds — verified by writing `"{ not json"` to the file and asserting startup completes without throwing and without a residue halt. | Task 1, Task 3 | `readResidueContext` ⇒ `corrupt`; startup emits `residue_context_unreadable` + proceeds |
| [ ] **(Failure-path)** A `git status` non-zero during the startup re-check routes to a halt (not a silent proceed) with `dirty_paths: []` and a "Residue check failed" message, mirroring the in-process catch arm. | Task 3 | Reuses unchanged `haltIfResidue` catch arm |
| [ ] `docs/ENGINE.md` and the `CLAUDE.md` *Failed-cycle dirty-worktree residue guard* note are updated to state that cross-process persistence is implemented (the "not implemented this cycle / in-process only … sole remaining recon-parity gap" caveat is removed/corrected, and the new state file + startup re-check are documented). | Task 4 | |
| [ ] All existing tests still pass. | Task 1–3 | `npm run test:coverage`; no semantic change to existing guard machinery |
| [ ] No compiler/linter warnings introduced (`npm run typecheck` clean). | Task 1–3 | Per-task typecheck criterion |

---

## Testing Strategy

### Unit Tests
**File**: `tests/engine/residue-context-store.test.ts` (new)
- **Round-trip**: `writeResidueContext` then `readResidueContext` returns `{status:"ok", ctx}` with `cycleId`/`issueId`/`failingStep` preserved, including `failingStep: undefined` round-tripping through `null`.
- **Missing file**: `readResidueContext` on an absent path ⇒ `{status:"none"}` (real temp dir, no file written).
- **Malformed JSON** (failure-path): write `"{ not json"` to the file ⇒ `{status:"corrupt", error}`, no throw.
- **Wrong shape** (failure-path): write `'{"cycleId":""}'` / `'{"foo":1}'` / `'"a string"'` ⇒ `corrupt`.
- **Non-ENOENT read error** (failure-path): inject a deps `readFileSync` that throws `{code:"EACCES"}` ⇒ `corrupt` (deps seam; or real `chmod 0` per `node:fs/promises` mock limitation).
- **Delete missing** (failure-path): `deleteResidueContext` on an absent path ⇒ no throw; on a non-ENOENT `unlinkSync` error (injected deps) ⇒ rethrows.
- **Atomic write**: after `writeResidueContext`, no `…json.tmp` remains (rename consumed it).
- **Mocking strategy**: prefer real temp-dir filesystem manipulation; use the `ResidueStoreDeps` seam only for injected error codes (EACCES/non-ENOENT unlink), since `node:fs/promises` cannot be `mock.method`-stubbed.

### Integration / E2E Tests
**File**: `tests/cli/failed-residue-guard.test.ts` (extend; reuse `ensureDist`/`bootstrapRepo`/`seedTodo`/`workflowYml`/`readEvents`)
- **Startup halt (happy-path-of-failure)**: bootstrap a trunk-mode repo, write `.cycle/failed-residue-context.json` (`{cycleId:"X", issueId:"A", failingStep:"verify"}`) and an untracked `src/residue.ts`, **no** in-flight tail (no `cycle.start`/`cycle.end` for an open cycle). Run `dist/cycle.js`. Assert `events.filter(e => e.event==="engine.halted" && e.reason==="failed_cycle_dirty_worktree").length === 1`, the terminal `engine.stop {reason:"failed_cycle_dirty_worktree"}` is pinned `length === 1`, no `cycle.start` appears, stderr contains the diagnostic, exit code non-zero.
- **Clean restart**: write the context file, leave the tree clean. Assert no residue `engine.halted`, the file is absent afterward, and the engine proceeds (processes the seeded todo or exits 0 cleanly).
- **Malformed context** (failure-path): write `"{ not json"`. Assert startup emits `engine.warning {reason:"residue_context_unreadable"}`, no residue `engine.halted`, engine proceeds without throwing.
- **git-status failure during startup re-check** (failure-path): write the context file + an untracked file, then `rm -rf .git` in the repo before launch. Assert halt with `dirty_paths: []` and a "Residue check failed" message.
- **Clear-on-success / clear-on-noop**: drive a successful (and a noop) cycle that first armed/persisted the file (or pre-write the file), assert `.cycle/failed-residue-context.json` is absent after the success/noop drain.
- **Persist-at-terminal-failure**: reuse `RESIDUE_SCRIPT` with `workflowYml(2,1)` so the first terminal failure halts via the in-process loop-top guard; before that halt the terminal branch persists — assert the file exists with the matching `cycleId`/`issueId` (read it from the temp repo after the run).
- **Cardinality discipline**: pin the startup `engine.halted` and terminal `engine.stop` with `filter(...).length === 1`; use `expectExactlyOne` from `tests/helpers.ts` where the payload (`failed_cycle_id`, `issue_id`, `dirty_paths`) is asserted.

## Risk Assessment
- **TDZ from relocated declarations**: moving `cyclesProcessed`/`pendingResidueContext`/`engineStopEmitted` could miss a residual use before the new location. *Mitigation*: relocate to immediately after `engine.start` (`:223`), well before any reader; `npm run typecheck` + full suite catch any ordering regression.
- **Startup re-check firing on a stale file from an older engine version**: a leftover file from before this cycle would trigger a clean-tree re-check that deletes it. *Mitigation*: harmless by design — clean tree ⇒ delete + proceed; corrupt ⇒ warn + delete + proceed.
- **Double terminal `engine.stop`**: the startup `process.exit(1)` after `emitResidueHalt` could race the epilogue. *Mitigation*: startup halt exits directly before the loop/epilogue is reached (mirrors preflight `:250`); `engineStopEmitted` additionally guards the epilogue; cardinality pin in tests.
- **Residual within-budget-retry cross-process gap**: a process that crashes after a within-budget retry was queued (but not re-run) leaves residue with no persisted context. *Mitigation*: explicitly Out of Scope (SPEC); documented in `docs/ENGINE.md` and "What We're NOT Doing" so it is a known, declared limitation, not a silent one.
- **Coverage floor on the new module**: a 100% floor is strict. *Mitigation*: the module is small and fully exercised by the unit tests above (every read branch, the atomic write, both delete branches); the deps seam covers injected error codes.
