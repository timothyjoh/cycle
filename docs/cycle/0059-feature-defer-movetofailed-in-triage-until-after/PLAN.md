```markdown
# Implementation Plan: Cycle 0059

## Overview

Defer `moveToFailed` (raw → `failed/` rename) in `src/engine/triage.ts` until after the whole-pass `all_triage_failed` classification. On the all-fail path raws stay in `raw/` so `cycle triage --dry-run` re-evaluates them without operator `mv`. Partial-failure path is preserved: failed raws still land in `failed/` with `failed_step: "triage"`.

## Current State (from Research)

- `runTriage` (`src/engine/triage.ts:155-249`) calls `moveToFailed` inside the per-raw failure branch at `:216-220`, BEFORE the whole-pass `failed.length === raws.length` classification at `:227-242`.
- `moveToFailed` (`:652-670`) stamps `triage_attempts: MAX_ATTEMPTS`, `failed_at`, `failed_step: "triage"` then renames `raw/<id>.md → failed/<id>.md`. Both inner ops are individually try/catch-swallowed.
- `bumpAttempts` (`:641-650`) runs per attempt via the `onAttemptFailed` callback inside `processRawWithRetry`; this code path is independent of `moveToFailed` and survives unchanged.
- `lastErrors[]` is index-aligned with `failed[]` (`:217-218`) and feeds the `engine.paused` payload at `:232-235`.
- `rewriteOrdering` (`:223-225`, `:672-697`) consumes only the queue rows applied by `applyRaw`; failed raws never appear in ordering, so its placement relative to the deferred flush is irrelevant.
- `dryRunTriage` (`:251-307`) reads only from `raw/` and clones each raw with `attempts: 0` — once raws stay in `raw/`, dry-run re-evaluation needs no `mv`.
- Fault tests (`tests/engine/triage.faults.test.ts:90-251`) currently use **single-raw all-fail** scenarios to cover `bumpAttempts` / `moveToFailed.stamp` / `moveToFailed.rename` swallow paths; under the new behavior `moveToFailed` is never called on all-fail, so two of these must move to a partial-fail scenario to preserve coverage.

## Desired End State

- All-fail triage pass: `docs/cycle/issues/raw/` is unchanged from pre-pass; `docs/cycle/issues/failed/` is unchanged from pre-pass. `engine.paused {reason: "all_triage_failed", raw_ids, last_errors}` cardinality and payload identical to today.
- Partial-failure pass: failed subset still under `docs/cycle/issues/failed/<id>.md` with `failed_step: "triage"` and `failed_at` stamped — identical to today.
- `triage_attempts` on raws still in `raw/` after all-fail = `3` (organic from per-attempt `bumpAttempts`). No `failed_at` / `failed_step` stamps on those raws (consistent with "no failure decision yet").
- `cycle triage --dry-run` after `engine.paused` reports every raw without operator filesystem fixup.
- `README.md`, `docs/RFC-001-issue-lifecycle.md`, `CLAUDE.md` reflect the new contract in the same cycle.
- Coverage: line ≥ 95% (global), branch ≥ 75%, function ≥ 90%, per-file `src/engine/triage.ts ≥ 95%`. No regressions.

Verification:
- `npm test` green.
- `npm run test:coverage` green (LCOV gate via `posttest:coverage`).
- `npm run typecheck` clean.
- Manual: `find docs/cycle/issues -type f` snapshot before and after a forced all-fail triage pass shows zero net change.

## What We're NOT Doing

- Changing `triage_attempts` semantics (still bumped per attempt by `bumpAttempts`). Recovery from `triage_attempts === 3` raws stuck in `raw/` on real engine re-fire is OUT OF SCOPE per issue acceptance criteria (operator edits the frontmatter as part of recovery; documented behavior).
- Changing `engine.paused` payload schema (shape stays `{reason, raw_ids, last_errors}`).
- Changing partial-failure behavior beyond preserving today's outcome.
- Changing `dryRunTriage`'s `attempts: 0` clone or its retry budget.
- Refactoring `processRawWithRetry`'s signature.
- Changing log event names, fields, or ordering.
- Touching the cycle-0058 SPEC.md byte-floor guard (separate concern; SPEC.md narration leak surfaced but stays a follow-up).
- Touching `.cycle/workflows.yml` or any workflow YAML (change is workflow-agnostic; dogfood `no_branch: true` is unaffected).

## Implementation Approach

Single-file engine change plus test realignment plus doc updates, in three vertical slices:

1. **Engine slice** — refactor `runTriage` to collect failed raws into a deferred list and flush `moveToFailed` only on the partial-failure path. Update existing tests that assert the old all-fail rename. Add the new all-fail-retention test and the dry-run-sees-raws test.
2. **Fault-coverage slice** — relocate `moveToFailed` stamp/rename swallow-path coverage from single-raw all-fail scenarios to partial-fail scenarios so the swallow branches stay exercised under the new branch placement.
3. **Docs slice** — update `README.md` recovery section, `docs/RFC-001-issue-lifecycle.md` §5, and `CLAUDE.md` triage paragraph to reflect that all-fail leaves raws in `raw/`.

Order: Slice 1 lands the contract and proves it via realigned + new tests. Slice 2 restores the fault-injection coverage that Slice 1's branch reshape orphans. Slice 3 ships docs together so README never lies about the recovery flow.

---

## Task 1: Defer `moveToFailed` to partial-fail flush in `runTriage`

### Overview

Replace the inline `await moveToFailed(...)` in the per-raw failure branch with deferred collection into a `failedRaws: RawIssue[]` list. After `rewriteOrdering`, branch on the existing `failed.length === raws.length` check: all-fail skips the flush and returns `paused`; partial-fail iterates `failedRaws` calling `moveToFailed` on each.

### Changes Required

**File**: `src/engine/triage.ts`

**Changes**: in `runTriage`, between `:182-249`:

```ts
const processed: string[] = [];
const failed: string[] = [];
const lastErrors: string[] = []; // index-aligned with `failed`
const failedRaws: RawIssue[] = []; // index-aligned with `failed`; deferred flush
let lastOrdering: string[] | null = null;

for (const raw of raws) {
  const outcome = await processRawWithRetry(raw, { ... }); // unchanged
  if (outcome.status === "ok") {
    // ...unchanged...
  } else {
    failed.push(raw.id);
    lastErrors.push(outcome.lastError);
    failedRaws.push(raw); // NEW: defer the rename
  }
}

if (lastOrdering) {
  await rewriteOrdering(repoRoot, lastOrdering, log);
}

if (failed.length === raws.length) {
  // all-fail: raws stay in raw/, skip deferred moveToFailed
  const MAX_ERR_LEN = 2000;
  const truncate = (s: string) =>
    s.length > MAX_ERR_LEN ? s.slice(0, MAX_ERR_LEN - 1) + "…" : s;
  const raw_ids = failed;
  const last_errors = failed.map((raw_id, i) => ({
    raw_id,
    error: truncate(lastErrors[i] ?? ""),
  }));
  await log.emit("engine.paused", {
    reason: "all_triage_failed",
    raw_ids,
    last_errors,
  });
  return { status: "paused", processed, failed };
}

// partial-failure path: flush deferred renames
for (const raw of failedRaws) {
  await moveToFailed(repoRoot, raw);
}

await log.emit("triage.end", {
  processed: processed.length,
  failed: failed.length,
});
return { status: "ok", processed, failed };
```

`moveToFailed` itself is unchanged. `bumpAttempts` is unchanged. `processRawWithRetry` is unchanged.

### Success Criteria

- [ ] `npm run typecheck` clean.
- [ ] `npm test` green (after Task 2 + Task 3 test realignment).
- [ ] On all-fail: zero `rename` calls into `failed/`. On partial-fail: one `rename` per failed raw, identical to today.
- [ ] `engine.paused` payload byte-for-byte identical to pre-change snapshot.

---

## Task 2: Realign existing all-fail tests to assert `raw/` retention

### Overview

Four existing tests assert that single-raw all-fail scenarios produce `failed/<id>.md`. Flip them to assert `raw/<id>.md` retention (plus `failed/` empty) and update `triage_attempts === 3` to be read from the raw file. The `vanish` test's assertion stays true under the new behavior but its rationale text changes.

### Changes Required

**File**: `tests/engine/triage.test.ts`

**Changes** at `:487-534` (`"whole-pass failure: only raw fails all attempts → engine.paused"`):

```ts
// REMOVE
const failedFiles = await readdir(join(root, "docs/cycle/issues/failed"));
assert.deepEqual(failedFiles, ["only.md"]);
const failedBody = await readFile(
  join(root, "docs/cycle/issues/failed/only.md"),
  "utf8",
);
const { fm } = parseFrontmatter(failedBody);
assert.equal(fm.triage_attempts, 3);

// REPLACE WITH
const rawFiles = await readdir(join(root, "docs/cycle/issues/raw"));
assert.deepEqual(rawFiles, ["only.md"]);
let failedFiles: string[] = [];
try {
  failedFiles = await readdir(join(root, "docs/cycle/issues/failed"));
} catch {
  failedFiles = [];
}
assert.deepEqual(failedFiles, []);
const rawBody = await readFile(
  join(root, "docs/cycle/issues/raw/only.md"),
  "utf8",
);
const { fm } = parseFrontmatter(rawBody);
assert.equal(fm.triage_attempts, 3);
assert.equal(fm.failed_at, undefined);
assert.equal(fm.failed_step, undefined);
```

**File**: `tests/engine/triage.faults.test.ts`

**Changes** at `:90-130` (`agentfail`):
- Flip `failed/agentfail.md` assertion to `raw/agentfail.md` exists; `failed/` empty.
- Drop the `failed_at` / `failed_step` assertions (no stamps on all-fail).

**Changes** at `:220-251` (`vanish`):
- Keep the assertion that `failed/vanish.md` is absent (still true: `moveToFailed` is never called on all-fail).
- Update the test's rationale comment / title to reflect the new contract: the raw is gone from `raw/` because the test unlinked it mid-flight, never because of a swallowed rename.

### Success Criteria

- [ ] Realigned tests pass against the Task 1 engine change.
- [ ] No new test asserts a `failed/<id>.md` file in a single-raw all-fail scenario.

---

## Task 3: Add new all-fail retention + dry-run re-eval tests

### Overview

Add explicit positive tests for the two new invariants in the issue acceptance criteria: (a) all-fail leaves `raw/` intact; (b) `cycle triage --dry-run` after `engine.paused` sees the raws without manual `mv`.

### Changes Required

**File**: `tests/engine/triage.test.ts`

**New test** (insert after the realigned `:487-534` test):

```ts
test("all-fail: raws remain in raw/ with triage_attempts=3 and no failure stamps", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/a.md"),
      rawBody("a", "task a"),
      "utf8",
    );
    await writeFile(
      join(root, "docs/cycle/issues/raw/b.md"),
      rawBody("b", "task b"),
      "utf8",
    );
    const deps: TriageDeps = {
      runAgent: async () => ({ exitCode: 0, stdout: "not json", stderr: "" }),
    };
    const { log } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);
    assert.equal(result.status, "paused");
    assert.deepEqual(result.failed.sort(), ["a", "b"]);

    const rawFiles = (
      await readdir(join(root, "docs/cycle/issues/raw"))
    ).sort();
    assert.deepEqual(rawFiles, ["a.md", "b.md"]);

    let failedFiles: string[] = [];
    try {
      failedFiles = await readdir(join(root, "docs/cycle/issues/failed"));
    } catch {
      failedFiles = [];
    }
    assert.deepEqual(failedFiles, []);

    for (const id of ["a", "b"]) {
      const body = await readFile(
        join(root, `docs/cycle/issues/raw/${id}.md`),
        "utf8",
      );
      const { fm } = parseFrontmatter(body);
      assert.equal(fm.triage_attempts, 3);
      assert.equal(fm.failed_at, undefined);
      assert.equal(fm.failed_step, undefined);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

**File**: `tests/engine/triage-dry-run.test.ts`

**New test**:

```ts
test("dry-run after all-fail pause sees the same raws without manual mv", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/p.md"),
      rawBody("p", "task p"),
      "utf8",
    );
    const failingAgent: TriageAgentRunner = async () => ({
      exitCode: 0,
      stdout: "not json",
      stderr: "",
    });
    const { log } = makeLog();
    // First pass: real triage hits all-fail.
    const r1 = await runTriage(root, makeConfig(), log, { runAgent: failingAgent });
    assert.equal(r1.status, "paused");

    // Dry-run pass without any operator filesystem fixup.
    const report = await dryRunTriage(root, makeConfig(), { runAgent: failingAgent });
    assert.equal(report.length, 1);
    assert.equal(report[0].raw_id, "p");
    assert.equal(report[0].status, "failed");
    assert.equal(report[0].attempts, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria

- [ ] Both new tests pass against the Task 1 engine change.
- [ ] Partial-failure test at `tests/engine/triage.test.ts:438-485` continues to pass with no edits (regression guard).
- [ ] Coverage gate (`npm run check:coverage`) clean.

---

## Task 4: Repoint `moveToFailed` stamp/rename fault tests to partial-fail

### Overview

`tests/engine/triage.faults.test.ts:177-216` (`stampfail`) injects a fault into the `mutateFrontmatter` call inside `moveToFailed`. Under the new behavior `moveToFailed` is never invoked on all-fail, so the injection point is dead. Reshape to a partial-fail scenario: add a second raw that decomposes cleanly, so the failed raw flows through the deferred flush and the swallow path stays exercised. Same treatment for any `moveToFailed.rename` swallow-path coverage (the third `vanish`-style scenario, if it is repositioned similarly — verify on read; otherwise leave `vanish` alone).

### Changes Required

**File**: `tests/engine/triage.faults.test.ts`

**Changes** at `:177-216` (`stampfail`):

Restructure so the test has two raws — one that fails all attempts (`stampfail`), one that succeeds (`ok`). The deferred flush will then invoke `moveToFailed` on `stampfail`, where the injected fault on `mutateFrontmatter` fires inside the existing swallow block. Update assertions:

- Result status: `"ok"` (partial-fail), not `"paused"`.
- `failed/stampfail.md` exists (rename completes despite stamp fault).
- `raw/stampfail.md` is absent.
- `raw/ok.md` is absent (decomposed cleanly via `applyRaw`).
- `engine.paused` is NOT emitted.

`bumpfail` at `:134-173` injects a fault on `bumpAttempts`, which runs inside `processRawWithRetry` and is **independent** of `moveToFailed`'s placement. The fault still fires on every attempt under the new behavior regardless of all-fail vs partial-fail. Keep `bumpfail` as a single-raw all-fail scenario; update only the post-pause assertion (`raw/bumpfail.md` exists, `failed/` empty, `triage_attempts` reflects however many bumps survived the fault per the existing semantics — read the current test for the exact expected count and preserve).

### Success Criteria

- [ ] `stampfail`'s injected fault still fires (assert via the existing fault-injection counter or recorded call).
- [ ] `moveToFailed` stamp-pass swallow branch coverage maintained per LCOV.
- [ ] `bumpfail` continues to exercise `bumpAttempts` swallow branch in an all-fail scenario.
- [ ] `npm run check:coverage` shows no regression on `src/engine/triage.ts`.

---

## Task 5: Update docs to reflect raw/ retention on all-fail

### Overview

Three doc files describe the old behavior (`failed/<id>.md` after `engine.paused` plus an operator `mv` step). Update them in this cycle, per the issue's acceptance criteria.

### Changes Required

**File**: `README.md`

- `:139` ("moves each failed raw to `docs/cycle/issues/failed/<id>.md` with `failed_step: "triage"` stamped") → rewrite: "leaves each failed raw in place under `docs/cycle/issues/raw/<id>.md` with `triage_attempts: 3` stamped; `failed/` is untouched." Move the "stamped with `failed_step: triage`" language into the partial-failure sub-bullet immediately below.
- `:161-167` (operator instructions: `ls docs/cycle/issues/failed/`) → `ls docs/cycle/issues/raw/`.
- `:177-183` (the explicit `mv failed/<id>.md raw/<id>.md` step) → delete the step entirely; collapse the surrounding numbered list.
- `:198-201` ("Edit `docs/cycle/issues/failed/<id>.md`") → `Edit docs/cycle/issues/raw/<id>.md`. Add a one-line note: "if you want a fresh 3-attempt budget on re-fire, also reset `triage_attempts` in the frontmatter."
- `:209` ("the only on-disk side effects are the raw files moved from `raw/` to `failed/`") → "the only on-disk side effects on the all-fail path are per-attempt `triage_attempts` bumps on each raw's frontmatter; the `engine.paused` log line; and preceding `triage.raw.failed` events."

**File**: `docs/RFC-001-issue-lifecycle.md`

- `:223-225` (partial-failure description) → no change.
- `:227` (all-fail emit) → add: "Raws remain in `raw/`; no rename occurs on the all-fail path. `triage_attempts` is bumped per attempt via `bumpAttempts` and reflects the full 3 on `engine.paused`."

**File**: `CLAUDE.md`

- The triage paragraph in §Architecture quick reference (around `:68`, the bullet starting "Triage subroutine: `src/engine/triage.ts`...") → append a sentence: "On the whole-pass `all_triage_failed` path, raws remain in `raw/` (no `moveToFailed` rename); partial-failure paths still move the failed subset to `failed/<id>.md` with `failed_step: "triage"` and `failed_at` stamped."

### Success Criteria

- [ ] `grep -nE 'failed/[a-z-]+\.md' README.md` returns only the partial-failure context — no all-fail / recovery references.
- [ ] No README step reads "mv failed/... raw/...".
- [ ] `docs/RFC-001-issue-lifecycle.md` §5 mentions both paths and their distinct contracts.
- [ ] `CLAUDE.md` triage paragraph names the new contract explicitly.

---

## Testing Strategy

### Unit Tests

- All-fail retention: `raw/` listing unchanged, `failed/` empty, `triage_attempts === 3`, no `failed_at` / `failed_step` stamps.
- Partial-failure rename: failed subset flushed to `failed/<id>.md`, `failed_step: "triage"`, `failed_at` populated, `triage_attempts === 3`. Use the existing `tests/engine/triage.test.ts:438-485` test as the regression guard plus the repointed `stampfail` for fault-injection coverage.
- `engine.paused` payload: `raw_ids` and `last_errors` index-aligned, `last_errors` per-entry capped at 2000 chars with `…` suffix. Existing assertions at `tests/engine/triage.test.ts:487-534` cover this — preserve under the realignment.
- Dry-run after pause: `dryRunTriage` sees the same raws, reports `failed` with `attempts: 3` (fresh budget via the `attempts: 0` clone).
- Fault-injection coverage: `bumpfail` (all-fail; `bumpAttempts` swallow), `stampfail` (partial-fail; `moveToFailed` stamp swallow), `vanish` (all-fail; raw unlinked mid-flight).

Mocking strategy: the existing `setupRepo()` harness builds real tmp directories. `runAgent` is the only mocked seam — replaced with a deterministic function returning controlled `{exitCode, stdout, stderr}`. No mocks of `fs`, `mutateFrontmatter`, `rename`, or `bumpAttempts` except via the existing fault-injection wrappers in `triage.faults.test.ts`. Prefer real implementations everywhere else.

### Integration / E2E Tests

- Existing dispatch test (the dispatch / agent-resolution path in `tests/engine/triage.test.ts`) is unaffected; runs unchanged.
- Existing CLI surface tests (`tests/cli/triage*.test.ts`) consume `result.status` only — `paused` semantics unchanged at that layer, so no edits required. Verify each still passes; if any inspect `failed/` directly, repoint to `raw/`.

## Risk Assessment

- **Risk: operator re-fires real engine without resetting `triage_attempts`** — raws still in `raw/` with `triage_attempts === 3` cause `loadRaws` to set `attempts: 3`, the retry loop in `processRawWithRetry` skips entirely (the `for (let attempt = raw.attempts; attempt < MAX_ATTEMPTS; attempt++)` condition is false immediately), the raw classifies as failed with `lastError === ""`, and the engine immediately re-pauses. *Mitigation:* README recovery section adds a one-line "reset `triage_attempts`" note. Behavior change to cap or reset attempts is OUT OF SCOPE per the issue.
- **Risk: fault-injection coverage on `moveToFailed.stamp` regresses** — single-raw all-fail tests no longer reach the swallow block. *Mitigation:* Task 4 repoints `stampfail` to a partial-fail scenario, restoring the swallow-branch hit. Coverage gate (`scripts/coverage-gate.mjs`) catches a regression on `src/engine/triage.ts` immediately.
- **Risk: rewriteOrdering side effects on partial-fail interact with deferred flush** — none. `rewriteOrdering` consumes only `applyRaw`-applied queue rows; failed raws never appear there. Order between `rewriteOrdering` and the deferred flush is independent. *Verification:* the existing partial-fail test at `tests/engine/triage.test.ts:438-485` exercises both side effects together and stays green.
- **Risk: cycle-0058 SPEC.md byte-floor guard surface noise** — the current cycle's SPEC.md is 124 bytes (< 200) yet `step.end status:"ok"` was emitted. Out of scope for this cycle but documented in RESEARCH §Open Questions for the next cycle. Plan operates from the authoritative issue file (`docs/cycle/issues/todo/refl-0024-defer-movetofailed-until-after-all-triag.md`), not SPEC.md.
- **Risk: doc edits drift from engine contract** — README has five distinct touch points (`:139`, `:161-167`, `:177-183`, `:198-201`, `:209`). *Mitigation:* Task 5's `grep` success criterion catches stragglers.
```
