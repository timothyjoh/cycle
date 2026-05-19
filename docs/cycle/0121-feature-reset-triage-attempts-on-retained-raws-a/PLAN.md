`mutateFrontmatter` already imported at line 7. All open questions resolved. Writing the plan now.

**Open question resolutions:**
1. Reset **before** `log.emit("engine.paused")` — on-disk state authoritative before announcing pause
2. Silent catch-swallow — consistent with `bumpAttempts`, raw may vanish mid-flight
3. Tests go in `triage.test.ts` — no new file needed

```markdown
# Implementation Plan: Cycle 0121

## Overview

Reset `triage_attempts` to `0` for every retained raw in the all-fail branch of `runTriage`, before emitting `engine.paused`. Eliminates the silent re-pause trap where raws with `triage_attempts: 3` skip agent invocation entirely on the next engine run.

## Current State (from Research)

- **Bug location**: `src/engine/triage.ts:228-245` — all-fail branch emits `engine.paused` and returns without resetting frontmatter.
- **Silent skip path**: `processRawWithRetry` loop at line 95 — `for (let attempt = raw.attempts; attempt < MAX_ATTEMPTS; attempt++)`. With persisted `triage_attempts: 3`, loop body never executes; function returns `{status: "failed", lastError: "", attempts: 0}` immediately.
- **Fix primitive available**: `mutateFrontmatter` already imported at line 7. `failedRaws[]` array already populated (index-aligned with `failed[]`), carrying `.srcPath` for each retained raw.
- **Pattern to follow**: `bumpAttempts` (lines 649-658) — same `mutateFrontmatter` call with identical try/catch-swallow.
- **Tests to update**: `triage.test.ts:533` and `triage.test.ts:575-577` assert `triage_attempts: 3`; both invert to `0`. Test name at line 541 also encodes old behavior.

## Desired End State

After an all-fail triage pass:
- Every `raw/<id>.md` on disk has `triage_attempts: 0` in frontmatter.
- `engine.paused` is emitted after the reset (on-disk state consistent before the log event).
- A subsequent `runTriage` call (no operator edits) invokes the agent for each retained raw — not a zero-call short-circuit.
- README §Recovering from engine.paused no longer instructs operators to manually reset `triage_attempts`.

## What We're NOT Doing

- Changing `MAX_ATTEMPTS`.
- Option B (within-pass counter / dropping persisted `triage_attempts`).
- Touching the partial-fail `moveToFailed` flush — that path is correct and in scope of other issues.
- Adding a `step.warning` log event for reset failures (scope creep; catch-swallow suffices).
- Moving tests to a new file.

## Implementation Approach

Single decision point: insert a `for...of failedRaws` loop inside the all-fail `if` block, before the `await log.emit("engine.paused", ...)` call. Each iteration calls `mutateFrontmatter(raw.srcPath, fm => ({ ...fm, triage_attempts: 0 }))` wrapped in try/catch (swallow). No new imports, no new helpers, no new files.

---

## Task 1: Add Reset Loop in `triage.ts` and Update Tests

### Overview

Three changes in one task (tightly coupled — test assertions directly mirror the implementation):

1. Insert reset loop in all-fail branch.
2. Update two existing test assertions from `3` → `0`.
3. Add one regression test: second `runTriage` call after all-fail proves agent is invoked.

### Changes Required

**File**: `src/engine/triage.ts`

Inside the `if (failed.length === raws.length)` block (lines 228-245), add the reset loop **before** `await log.emit("engine.paused", ...)`:

```ts
if (failed.length === raws.length) {
  // All-fail path: raws stay in raw/ so `cycle triage --dry-run` can
  // re-evaluate them after operator edits without any manual `mv`.

  // Reset attempts so the next engine invocation is not a no-op.
  for (const raw of failedRaws) {
    try {
      await mutateFrontmatter(raw.srcPath, (fm) => ({ ...fm, triage_attempts: 0 }));
    } catch {
      // raw may have been removed mid-flight; skip silently
    }
  }

  const MAX_ERR_LEN = 2000;
  // ... rest of block unchanged
```

**File**: `tests/engine/triage.test.ts`

*Change 1* — Line 533: update assertion to reflect reset:
```ts
// before:
assert.equal(fm.triage_attempts, 3);
// after:
assert.equal(fm.triage_attempts, 0);
```

*Change 2* — Line 541: rename test to match new behavior:
```ts
// before:
test("all-fail: raws remain in raw/ with triage_attempts=3 and no failure stamps", async () => {
// after:
test("all-fail: raws remain in raw/ with triage_attempts reset to 0 and no failure stamps", async () => {
```

*Change 3* — Lines 575-576: update assertions in the `for (const id of ["a", "b"])` loop:
```ts
// before:
assert.equal(fm.triage_attempts, 3);
// after:
assert.equal(fm.triage_attempts, 0);
```

*Change 4* — Add regression test after the "all-fail: raws remain..." test (after line 583):

```ts
test("all-fail reset: subsequent triage pass invokes agent for each retained raw", async () => {
  const root = await setupRepo();
  try {
    await writeFile(join(root, "docs/cycle/issues/raw/a.md"), rawBody("a", "task a"), "utf8");
    await writeFile(join(root, "docs/cycle/issues/raw/b.md"), rawBody("b", "task b"), "utf8");

    let callCount = 0;
    const deps: TriageDeps = {
      runAgent: async () => {
        callCount++;
        return { exitCode: 0, stdout: "not json", stderr: "" };
      },
    };

    // First pass: all-fail → paused; reset writes triage_attempts: 0
    const { log: log1 } = makeLog();
    const result1 = await runTriage(root, makeConfig(), log1, deps);
    assert.equal(result1.status, "paused");

    for (const id of ["a", "b"]) {
      const body = await readFile(join(root, `docs/cycle/issues/raw/${id}.md`), "utf8");
      const { fm } = parseFrontmatter(body);
      assert.equal(fm.triage_attempts, 0);
    }

    // Second pass: must invoke agent (not zero-call short-circuit)
    callCount = 0;
    const { log: log2 } = makeLog();
    const result2 = await runTriage(root, makeConfig(), log2, deps);
    assert.equal(result2.status, "paused");
    assert.ok(callCount >= 2, "agent must be invoked for each retained raw on re-triage");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria

- [ ] `npm run typecheck` passes — no new type errors
- [ ] `npm test` passes — 441+ tests green; two updated tests no longer assert `3`
- [ ] `npm run test:coverage && npm run check:coverage` passes — `triage.ts` ≥ 95% line (new reset loop lines covered by regression test)
- [ ] After an all-fail pass in the regression test, `triage_attempts: 0` confirmed via `parseFrontmatter`
- [ ] Second `runTriage` call in regression test has `callCount >= 2`

---

## Task 2: Update `README.md` §Recovering from engine.paused

### Overview

Four stale passages describe the old `triage_attempts: 3` behavior. Update them to reflect that the engine now resets to `0` and operators no longer need to manually edit frontmatter.

### Changes Required

**File**: `README.md`

*Line 137* — update "with `triage_attempts: 3` stamped":
```
# before:
…with `triage_attempts: 3` stamped into its frontmatter; `failed/` is untouched on this path.

# after:
…with `triage_attempts: 0` stamped into its frontmatter (the engine resets the counter at the pause boundary so re-triage is not a no-op); `failed/` is untouched on this path.
```

*Line 167* — update "Each raw's frontmatter carries `triage_attempts: 3`":
```
# before:
Each raw's frontmatter carries `triage_attempts: 3` after the paused pass (organic from per-attempt `bumpAttempts`); no `failed_at` or `failed_step` stamps are written on the all-fail path.

# after:
Each raw's frontmatter carries `triage_attempts: 0` after the paused pass (the engine resets the counter at the pause boundary after the per-attempt `bumpAttempts` calls); no `failed_at` or `failed_step` stamps are written on the all-fail path.
```

*Line 197* — remove the manual-reset instruction from the "Edit `docs/cycle/issues/raw/<id>.md`" bullet:
```
# before:
- **Edit `docs/cycle/issues/raw/<id>.md`** if the issue is real but its content tripped the prompt (typo, missing context, ambiguous title, malformed frontmatter). Re-run `cycle triage --dry-run` until it passes. To restore a fresh 3-attempt budget on real-engine re-fire, also reset `triage_attempts` in the frontmatter (otherwise the next engine invocation will immediately re-pause without invoking the agent).

# after:
- **Edit `docs/cycle/issues/raw/<id>.md`** if the issue is real but its content tripped the prompt (typo, missing context, ambiguous title, malformed frontmatter). Re-run `cycle triage --dry-run` until it passes.
```

*Line 208* — update safety guarantee to include the reset as an additional side effect:
```
# before:
The only on-disk side effects on the all-fail path are per-attempt `triage_attempts` bumps on each raw's frontmatter, the `engine.paused` line…

# after:
The only on-disk side effects on the all-fail path are per-attempt `triage_attempts` bumps followed by a final reset to `0` on each raw's frontmatter, the `engine.paused` line…
```

### Success Criteria

- [ ] `grep -n "triage_attempts: 3" README.md` returns no lines in the §Recovering from engine.paused section
- [ ] §Recovering from engine.paused §3 no longer mentions manual frontmatter reset
- [ ] Safety guarantee §4 mentions the reset side effect

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| All-fail triage pass leaves every retained raw in `raw/<id>.md` with `triage_attempts: 0` in frontmatter (rewrite is atomic via tmp-rename, same pattern as other `raw/` writes). | Task 1 | `mutateFrontmatter` uses tmp-rename internally; regression test asserts `triage_attempts: 0` |
| Re-running `cycle triage --dry-run` (or letting the engine retry) against the paused raws after no operator edits produces a normal triage pass — agent is invoked, `last_errors` reflects whatever the current failure mode is, not an empty array. | Task 1 | Regression test: second `runTriage` call asserts `callCount >= 2`; dry-run already overrides `raw.attempts` to `0` at line 287 so it was never broken |
| Partial-fail path is unchanged: failed subset still moves to `failed/<id>.md` with `triage_attempts: 3` + `failed_step` + `failed_at` stamped via the deferred `moveToFailed` flush. | WAIVED — reset loop is inside `if (failed.length === raws.length)` which is mutually exclusive with the partial-fail path; no code touches `moveToFailed`; existing partial-fail tests remain green | |
| README §Recovering from engine.paused is updated to drop the `triage_attempts` reset step (the engine now handles it). | Task 2 | Four passages updated |
| Regression test pinning: after an all-fail pass, every retained `raw/<id>.md` has `triage_attempts: 0`, and a subsequent triage pass invokes the agent for each (not a zero-call short-circuit). | Task 1 | New test added after line 583 in `triage.test.ts` |

---

## Testing Strategy

### Unit Tests

- **Existing tests (updated)**: Two all-fail tests in `triage.test.ts` flip assertion from `3` to `0` — they already cover the single-raw and multi-raw all-fail cases with filesystem read-back.
- **New regression test**: Two-pass scenario — first pass pauses, verifies `triage_attempts: 0` on disk, second pass proves `callCount >= 2`. Uses real filesystem via `setupRepo()` temp dir. No mocking of `mutateFrontmatter` — real write required for the regression pin.
- **Fault test coverage**: `triage.faults.test.ts:268` (raw unlinked mid-flight) already covers the catch-swallow path implicitly; no changes needed there.

### Integration / E2E Tests

No new integration tests needed — the regression test uses the real `runTriage` function with a real filesystem and a stub `runAgent`. The `mutateFrontmatter` + tmp-rename path is exercised without mocking, which is the anti-mock bias requirement.

## Risk Assessment

- **`failedRaws[]` not populated correctly**: Verified at lines 185 and 219-221 — populated before the all-fail branch, index-aligned with `failed[]`. Low risk.
- **`mutateFrontmatter` throws for a valid raw**: Catch-swallow means a reset failure is invisible. Acceptable — same contract as `bumpAttempts`. The raw will have stale `triage_attempts: 3` in that edge case, which is the pre-fix state, not worse.
- **Coverage gate regression**: New lines in the reset loop are directly covered by both the updated two-raw test and the new regression test. `triage.ts` was at 99%+ line pre-fix; new lines stay covered.
```
