# Implementation Plan: Cycle 0243

## Overview

Add a `priority === 'discuss'` skip guard to `dryRunTriage` in `src/engine/triage.ts`, mirroring the existing guard in `runTriage`, so that `cycle triage --dry-run` no longer invokes the agent for discuss raws. Cover the new branch with two tests in `tests/engine/triage-dry-run.test.ts` and remove the known-limitation note from `docs/ENGINE.md`.

## Current State (from Research)

- `runTriage` has the guard at lines 194–197: `if (raw.fm.priority === "discuss") { await parkForDiscussion(...); continue; }`.
- `dryRunTriage` (lines 274–331) has no such guard; `processRawWithRetry` is called unconditionally at line 303 for every raw.
- `tests/engine/triage-dry-run.test.ts` has 11 tests; its `rawBody` helper (line 53) takes `(id, title, attempts=0)` — no `priority` param. The analogous helper in `triage-priority.test.ts` (line 69) shows the backward-compatible optional-`priority` pattern.
- `docs/ENGINE.md` line 21 explicitly documents this divergence as a known limitation and describes the exact fix; it must be updated after the change.

## Desired End State

- `dryRunTriage` silently skips raws with `fm.priority === "discuss"` (pure `continue`, no `parkForDiscussion`, no side effects).
- `tests/engine/triage-dry-run.test.ts` has two new tests: single-discuss returns empty array with zero agent calls; mixed-batch calls agent once and returns one report for the normal raw.
- `docs/ENGINE.md` line 21 no longer contains the known-limitation caveat; the section accurately describes discuss routing for both `runTriage` and `dryRunTriage`.
- `npm test`, `npm run typecheck`, `npm run test:coverage && npm run check:coverage`, and `npm run check:invariants` all pass with `src/engine/triage.ts` at ≥ 95% line coverage.

## What We're NOT Doing

- Calling `parkForDiscussion` from `dryRunTriage` (dry-run is side-effect-free).
- Emitting `issue.parked_for_discussion` events from `dryRunTriage`.
- Changing `runTriage` or `parkForDiscussion` in any way.
- Modifying the CLI `--dry-run` output format.
- Asserting filesystem state in the new tests (no files move; byte-identity assertion unnecessary).
- Changing any file outside `src/engine/triage.ts`, `tests/engine/triage-dry-run.test.ts`, and `docs/ENGINE.md`.

## Implementation Approach

The implementation is three coordinated edits: one production guard (3 lines), one test-helper extension (backward-compatible optional param), two new tests, and one documentation update. No new imports, no new dependencies, no structural changes. All changes are confined to existing files.

---

## Task 1: Add discuss guard to `dryRunTriage`

### Overview

Insert the `if (raw.fm.priority === "discuss") { continue; }` guard immediately after the `for (const raw of raws) {` loop opener in `dryRunTriage`, before the comment block that precedes `processRawWithRetry`. This is a silent `continue` — no `parkForDiscussion` call, no event emission, no file I/O.

### Changes Required

**File**: `src/engine/triage.ts`

Insert after line 299 (`for (const raw of raws) {`), before line 300 (the comment):

```ts
  for (const raw of raws) {
    if (raw.fm.priority === "discuss") continue;
    // Dry-run reports the agent invocation count for THIS pass; on-disk
    // triage_attempts (from prior real runs) must not shrink the retry
    // budget. Clone with attempts: 0 to count from scratch.
    const outcome = await processRawWithRetry(
```

The guard is a one-liner (no braces needed; single `continue` statement). This matches the minimal-footprint requirement from the SPEC ("a single `continue` statement inside the existing `for` loop").

### Success Criteria

- [ ] `npm run typecheck` exits zero
- [ ] Guard is positioned after `for (const raw of raws) {` and before the existing comment and `processRawWithRetry` call
- [ ] No `parkForDiscussion` call added to `dryRunTriage`

---

## Task 2: Extend `rawBody` helper in `triage-dry-run.test.ts`

### Overview

Add an optional `priority?: string` parameter to the `rawBody` helper at line 53 of `tests/engine/triage-dry-run.test.ts`. When supplied, append `priority: ${priority}` to the frontmatter — exactly as `triage-priority.test.ts` line 69–81 does. All 11 existing call sites pass only `(id, title)` or `(id, title, attempts)`, so the signature change is fully backward-compatible (new param is third positional — but `attempts` is currently third, so this requires reordering or a different approach).

**Conflict resolution**: The current signature is `rawBody(id, title, attempts = 0)`. The `triage-priority.test.ts` pattern replaces `attempts` with `priority?`. In `triage-dry-run.test.ts`, `attempts` is used in one test ("dryRun skips raws with triage_attempts≥3"). The correct approach is to keep `attempts` as the third parameter and add `priority` as an optional fourth:

```ts
function rawBody(id: string, title: string, attempts = 0, priority?: string): string {
  const lines = [
    "---",
    `id: ${id}`,
    "source: text",
    `title: "${title}"`,
    "added_at: 2026-05-13T00:00:00Z",
    `triage_attempts: ${attempts}`,
  ];
  if (priority !== undefined) lines.push(`priority: ${priority}`);
  lines.push("---", "", title, "");
  return lines.join("\n");
}
```

All existing calls (`rawBody(id, id)`, `rawBody("r1", "r1")`, `rawBody(id, title, 3)`) remain valid unchanged.

### Changes Required

**File**: `tests/engine/triage-dry-run.test.ts`

Replace the `rawBody` function at lines 53–66:

```ts
// Before
function rawBody(id: string, title: string, attempts = 0): string {
  return [
    "---",
    `id: ${id}`,
    "source: text",
    `title: "${title}"`,
    "added_at: 2026-05-13T00:00:00Z",
    `triage_attempts: ${attempts}`,
    "---",
    "",
    title,
    "",
  ].join("\n");
}

// After
function rawBody(id: string, title: string, attempts = 0, priority?: string): string {
  const lines = [
    "---",
    `id: ${id}`,
    "source: text",
    `title: "${title}"`,
    "added_at: 2026-05-13T00:00:00Z",
    `triage_attempts: ${attempts}`,
  ];
  if (priority !== undefined) lines.push(`priority: ${priority}`);
  lines.push("---", "", title, "");
  return lines.join("\n");
}
```

### Success Criteria

- [ ] All existing 11 tests continue to pass
- [ ] `rawBody("x", "x", 0, "discuss")` produces frontmatter with `priority: discuss`
- [ ] `rawBody("x", "x")` produces identical output to before (no `priority` line)

---

## Task 3: Add two new tests to `triage-dry-run.test.ts`

### Overview

Append two tests at the end of `tests/engine/triage-dry-run.test.ts`. Both follow the existing `setupRepo` / `TriageDeps` / `try-finally` pattern exactly.

### Changes Required

**File**: `tests/engine/triage-dry-run.test.ts`

Append after the last existing test:

```ts
test("dryRun skips discuss-priority raw: returns empty reports, no agent call", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/disc1.md"),
      rawBody("disc1", "discuss raw", 0, "discuss"),
      "utf8",
    );
    let calls = 0;
    const deps: TriageDeps = {
      runAgent: async (): Promise<TriageAgentResult> => {
        calls++;
        return { exitCode: 0, stdout: decomposeJson("disc1"), stderr: "" };
      },
    };
    const reports = await dryRunTriage(root, makeConfig(), deps);
    assert.equal(reports.length, 0);
    assert.equal(calls, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dryRun mixed batch: discuss skipped, normal raw processed once", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/disc2.md"),
      rawBody("disc2", "discuss raw", 0, "discuss"),
      "utf8",
    );
    await writeFile(
      join(root, "docs/cycle/issues/raw/norm1.md"),
      rawBody("norm1", "normal raw"),
      "utf8",
    );
    let calls = 0;
    const deps: TriageDeps = {
      runAgent: async (): Promise<TriageAgentResult> => {
        calls++;
        return { exitCode: 0, stdout: decomposeJson("norm1"), stderr: "" };
      },
    };
    const reports = await dryRunTriage(root, makeConfig(), deps);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].raw_id, "norm1");
    assert.equal(reports[0].status, "ok");
    assert.equal(calls, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

**Notes on `decomposeJson` in the mixed-batch test**: the `runAgent` stub always returns `decomposeJson("norm1")`, which is the id of the only raw that will actually invoke it. This is correct — the discuss raw never reaches `processRawWithRetry`, so its id never appears in a prompt. The agent returns a valid decomposition for `norm1`, producing one `ok` report.

**Cardinality pinning**: `reports.length === 1` is a cardinality assertion (not `reports.find(...)`), consistent with CLAUDE.md's exactly-once pinning rule. `calls === 1` asserts exact agent invocation count.

### Success Criteria

- [ ] "single discuss" test: `reports.length === 0`, `calls === 0`
- [ ] "mixed batch" test: `reports.length === 1`, `reports[0].raw_id === "norm1"`, `reports[0].status === "ok"`, `calls === 1`
- [ ] Both tests pass in isolation (`node --test --test-name-pattern "dryRun.*discuss"`)
- [ ] Full suite passes: `npm test`

---

## Task 4: Update `docs/ENGINE.md`

### Overview

Remove the known-limitation sentence at line 21 from the `## Triage subroutine` section and replace it with an accurate description that covers both `runTriage` and `dryRunTriage` discuss routing.

### Changes Required

**File**: `docs/ENGINE.md`

Line 21 currently reads:

> **Known limitation:** `dryRunTriage` (used by `cycle triage --dry-run`) has no discuss-routing check. It calls the triage agent for every raw, including those with `priority: discuss`. An operator running `--dry-run` to debug a paused queue will see discuss raws processed by the agent — behavior that does not match the next live run. Fix: mirror the `if (raw.fm.priority === 'discuss') { ... continue; }` guard from `runTriage` into `dryRunTriage` before its agent invocation.

Replace with:

> **Discuss routing in dry-run:** `dryRunTriage` (used by `cycle triage --dry-run`) applies the same discuss guard as `runTriage`: raws with `priority: discuss` are silently skipped before the agent call and do not appear in the returned `DryRunReport[]`. No `parkForDiscussion` call is made and no files are moved — dry-run produces no side effects.

### Success Criteria

- [ ] "Known limitation" sentence no longer appears in `docs/ENGINE.md`
- [ ] Updated paragraph accurately describes `dryRunTriage` discuss behavior after the Task 1 change

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] dryRunTriage called with a single priority: discuss raw returns an empty DryRunReport[] and never calls runAgent` | Task 3 | "single discuss" test asserts `reports.length === 0` and `calls === 0` |
| `[ ] dryRunTriage called with a mixed batch (one discuss, one normal) calls runAgent exactly once (for the normal raw) and returns exactly one report entry` | Task 3 | "mixed batch" test asserts `calls === 1`, `reports.length === 1`, `reports[0].raw_id === "norm1"` |
| `[ ] npm test passes with no regressions` | Tasks 1–3 | All tasks must pass full suite |
| `[ ] npm run typecheck exits zero with no new errors` | Task 1 | Guard adds no new imports; `continue` is valid in `for...of` context |
| `[ ] npm run test:coverage && npm run check:coverage passes with src/engine/triage.ts at ≥ 95% line coverage` | Tasks 1, 3 | New guard branch covered by both new tests; existing lines unchanged |
| `[ ] npm run check:invariants passes` | Tasks 1–4 | No new structural patterns; no invariant table changes needed |

---

## Testing Strategy

### Unit Tests

- Both new tests use real filesystem (temp dir via `setupRepo`), real `dryRunTriage` implementation, and a stubbed `runAgent` that counts calls — no mocking of `triage.ts` internals.
- `rawBody` with `priority: "discuss"` exercises the frontmatter path through `loadRaws → parseFrontmatter → raw.fm.priority`.
- The guard branch (true case: skip; false case: proceed) is covered by test 1 (all-discuss, guard always true) and test 2 (mixed, guard true once and false once).

### Integration / E2E Tests

- `npm test` runs the full suite including existing 11 dry-run tests — any regression in `dryRunTriage` surfaces immediately.
- `npm run test:coverage` measures line coverage of `src/engine/triage.ts`; the new guard line must be covered by at least one test (both new tests cover it).

## Risk Assessment

- **`rawBody` signature change breaks existing call sites**: Mitigated — `priority` is the fourth optional parameter. All existing three-argument calls (`rawBody(id, title, attempts)`) are unaffected. Verified: only one existing test passes a third arg (`attempts = 3`) and it remains positionally correct.
- **`decomposeJson` in mixed-batch test uses hardcoded `"norm1"` id**: Correct by construction — the discuss raw never reaches the agent, so the agent only ever sees a prompt containing `norm1`. The stub ignores its prompt arg and returns a fixed `norm1` decomposition, which is what the single normal raw expects.
- **Coverage floor drop**: The new guard line is covered by both new tests (both iterate over at least one discuss raw). Net effect is the addition of one new covered line plus one new branch — coverage cannot decrease from the change.
- **ENGINE.md line number drift**: The known-limitation paragraph is at line 21 as of research time; verified via direct read. If the file shifts, the replacement is content-targeted (match the "Known limitation:" text), not line-number-targeted.
