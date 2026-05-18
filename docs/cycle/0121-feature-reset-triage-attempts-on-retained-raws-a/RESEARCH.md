I have everything needed. Writing the research document now.

```markdown
# Research: Cycle 0121

## Cycle Context

The spec asks for Option A from the issue: at the all-fail branch of `runTriage` in `src/engine/triage.ts`, after emitting `engine.paused` and before returning, rewrite each retained raw's `triage_attempts` frontmatter field back to `0` using an atomic tmp-rename write. This eliminates the operator-invisible trap where a paused raw with `triage_attempts: 3` is silently skipped by the retry loop on the next engine invocation.

---

## Current Codebase State

### Relevant Components

- **`runTriage` — all-fail branch**: `src/engine/triage.ts:228-245`
  After the loop over raws, if `failed.length === raws.length`, the engine emits `engine.paused` and returns `{status: "paused"}`. No frontmatter reset occurs here. The raws remain in `raw/` with whatever `triage_attempts` value `bumpAttempts` left — which is `3` for any raw that exhausted its budget.

- **`processRawWithRetry` — retry loop**: `src/engine/triage.ts:95`
  ```ts
  for (let attempt = raw.attempts; attempt < MAX_ATTEMPTS; attempt++) {
  ```
  `MAX_ATTEMPTS = 3` (line 86). A raw loaded with `triage_attempts: 3` produces `raw.attempts = 3`; the loop body never executes; `processRawWithRetry` returns `{status: "failed", lastError: "", attempts: 0}` immediately. This is the silent re-pause with empty `last_errors` the issue describes.

- **`loadRaws`**: `src/engine/triage.ts:317-335`
  Reads each `.md` in `raw/`, parses frontmatter, and sets `raw.attempts = typeof fm.triage_attempts === "number" ? fm.triage_attempts : 0`. This is the entry point where persisted `triage_attempts: 3` poisons the budget.

- **`bumpAttempts`**: `src/engine/triage.ts:649-658`
  Called by `onAttemptFailed` inside the loop. Calls `mutateFrontmatter(srcPath, fm => ({ ...fm, triage_attempts: attempts }))` with `attempts = attemptNumber` (1-indexed). After three failures, the raw on disk has `triage_attempts: 3`.

- **`mutateFrontmatter`**: `src/engine/frontmatter.ts:60-71`
  Reads the file, parses frontmatter, applies the patch function, serializes, writes to `path + ".tmp"`, then `rename(tmp, path)`. This is the existing atomic-write pattern used by both `bumpAttempts` and `moveToFailed`. The same pattern is required for the reset.

- **`moveToFailed` (partial-fail path)**: `src/engine/triage.ts:660-678`
  Called only for the partial-fail subset. Sets `triage_attempts: MAX_ATTEMPTS`, `failed_at`, `failed_step`, then renames `raw/<id>.md → failed/<id>.md`. This path is **out of scope** — the fix must not touch it.

- **`dryRunTriage`**: `src/engine/triage.ts:259-315`
  Already overrides the persisted attempts with `{ ...raw, attempts: 0 }` at line 287 so dry-run always gets a fresh budget. The real `runTriage` has no analogous reset today.

- **`failedRaws` accumulator**: `src/engine/triage.ts:185`
  Parallel to `failed[]` and `lastErrors[]`. Holds the `RawIssue` objects for the failed set. After the loop these are available to the all-fail branch. Each `RawIssue` carries `.srcPath` — the path needed for `mutateFrontmatter`.

### Existing Patterns to Follow

- **Atomic frontmatter mutation**: `mutateFrontmatter(srcPath, fm => ({ ...fm, triage_attempts: 0 }))` — same call as `bumpAttempts` but with `0`. Uses tmp-rename internally (already in `frontmatter.ts:60-71`). The `bumpAttempts` catch-swallow pattern (`try { ... } catch { /* raw may already be moved */ }`) should be replicated here since the raw could vanish mid-flight (fault test at `triage.faults.test.ts:268`).

- **Structured all-fail block**: The all-fail branch is a single `if` block at `triage.ts:228`. The reset loop fits inside that block, after constructing `last_errors` and before `log.emit("engine.paused", ...)` or immediately after — either ordering is valid since the emit is async and returns before the function returns.

### Dependencies & Integration Points

- **`RawIssue.srcPath`**: Already available in `failedRaws[]` — no additional data needed.
- **`mutateFrontmatter`**: Already imported at `triage.ts:6-8`. No new import required.
- **`failedRaws` array**: Populated in the per-raw loop at `triage.ts:219-221`. Index-aligned with `failed[]` and `lastErrors[]`. Available inside the all-fail branch.

### Test Infrastructure

- **Framework**: Node's built-in `node:test` runner, no transpile step (`--experimental-strip-types`).
- **Test files for triage**:
  - `tests/engine/triage.test.ts` — happy paths, retry, all-fail, partial-fail, ordering, atomicity
  - `tests/engine/triage.faults.test.ts` — fault injection (bumpAttempts swallow, mid-flight unlink, rewriteOrdering failure, rollback failure)
  - `tests/engine/triage-dry-run.test.ts` — dry-run coverage
  - `tests/engine/triage-validator.test.ts` — validator logic
- **Test helpers in `triage.test.ts`**: `setupRepo()` (creates tmp dir tree), `makeLog()` (captures events), `rawBody(id, title, attempts)` (generates raw markdown with frontmatter), `makeConfig()` (returns a `CycleConfig`).
- **Filesystem assertions pattern**: `readFile` + `parseFrontmatter` + `assert.equal(fm.field, expected)` — used throughout.
- **Coverage floor**: `src/engine/triage.ts` ≥ 95% line (`scripts/coverage-gate.mjs:13`). New lines in the all-fail branch must be covered by the regression test.

### Existing Tests That Will Require Updating

Two tests in `triage.test.ts` currently assert `triage_attempts: 3` after an all-fail pass. Both assertions will invert to `0` after the fix:

- **Line 533** (`"whole-pass failure: only raw fails all attempts → engine.paused"`): asserts `fm.triage_attempts, 3`.
- **Lines 575-577** (`"all-fail: raws remain in raw/ with triage_attempts=3 and no failure stamps"`): asserts `fm.triage_attempts, 3` for each of two raws. Test name also encodes the old behavior and must be renamed.

The test at `triage.test.ts:883` (`"persisted triage_attempts carries into next run for retry budget"`) seeds a raw with `triage_attempts: 2` and asserts only 1 agent call. **This test is about the partial-fail budget propagation, not all-fail.** It is not affected by the fix since it involves a single raw that fails all attempts (triggering all-fail), but the key assertion is call count before the paused emit, not the post-pause frontmatter. However, once the fix lands, after the paused emit the raw will have `triage_attempts: 0` — that test does not assert on the final frontmatter state, so it passes without change.

### README Documentation Requiring Update

Three passages in `README.md` describe the old behavior and will be stale:

- **Line 137**: states raws are left with `triage_attempts: 3` — must change to `0`.
- **Line 167**: states `triage_attempts: 3` as organic from `bumpAttempts` — must describe the reset.
- **Line 197**: instructs operator to manually reset `triage_attempts` in frontmatter before re-firing — this step must be removed since the engine now handles it.
- **Line 208**: "Safety guarantee" section mentions `triage_attempts` bumps as the only on-disk side effects — must add the reset as an additional side effect.

---

## Code References

- `src/engine/triage.ts:86` — `MAX_ATTEMPTS = 3`
- `src/engine/triage.ts:95` — retry loop start: `for (let attempt = raw.attempts; attempt < MAX_ATTEMPTS; attempt++)`
- `src/engine/triage.ts:185` — `failedRaws: RawIssue[]` accumulator (deferred flush)
- `src/engine/triage.ts:217-221` — per-raw failure: `failed.push`, `lastErrors.push`, `failedRaws.push`
- `src/engine/triage.ts:228-245` — all-fail branch: emits `engine.paused`, returns `paused`
- `src/engine/triage.ts:317-335` — `loadRaws`: reads `fm.triage_attempts` into `raw.attempts`
- `src/engine/triage.ts:649-658` — `bumpAttempts`: atomic `mutateFrontmatter` with catch-swallow
- `src/engine/triage.ts:287` — `dryRunTriage` overrides attempts: `{ ...raw, attempts: 0 }`
- `src/engine/frontmatter.ts:60-71` — `mutateFrontmatter`: tmp-rename atomic write
- `tests/engine/triage.test.ts:533` — asserts `triage_attempts: 3` post-pause (will change to `0`)
- `tests/engine/triage.test.ts:575-577` — asserts `triage_attempts: 3` for two raws (will change to `0`)
- `tests/engine/triage.faults.test.ts:268` — fault test: raw unlinked mid-flight; all-fail still completes
- `scripts/coverage-gate.mjs:13` — `triage.ts` 95% line floor
- `README.md:137,167,197,208` — stale documentation of `triage_attempts: 3` behavior

## Open Questions

- **Reset before or after `log.emit("engine.paused")`?** Either ordering works; the spec doesn't specify. Resetting before emit means the on-disk state is consistent before the log event fires, which is arguably safer for resume scenarios, but there is no current resume path that reads `raw/` after `engine.paused`. Planner should decide ordering.
- **Error handling for reset failures**: `bumpAttempts` swallows all errors silently. Should the reset use the same pattern, or surface a `step.warning`-style log event? The issue says "must be tmp-rename-atomic like every other write under `raw/`" but doesn't specify error surfacing. Planner should specify whether a failed reset emits a warning event or is fully silent.
- **Test file placement**: The regression test (two-call assertion after all-fail reset) could go in `triage.test.ts` alongside the other all-fail tests, or in a new file. Given `triage.test.ts` is already the natural home for all-fail behavior, adding there avoids a new file. Planner should confirm.
```
