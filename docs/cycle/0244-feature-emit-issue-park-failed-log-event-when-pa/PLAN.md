# Implementation Plan: Cycle 0244

## Overview

Add `log.emit('issue.park_failed', { id, error })` to the `catch` block of `parkForDiscussion` in `src/engine/triage.ts`, and add a unit test that triggers the failure path via real-filesystem fault injection to assert exactly one event with the correct payload.

## Current State (from Research)

- `parkForDiscussion` (`src/engine/triage.ts:708–729`) has a `catch` block at lines 719–721 that silently sets `renamed = false` with no log emission. The catch binder is `catch {` (no binding variable), so `e` is not available.
- `rename` is imported from `node:fs/promises` as a destructured binding captured at module load time — `mock.method` on `node:fs` (CJS) does not intercept it. Real-filesystem fault injection is required.
- Existing fault-injection pattern: pre-create the destination path as a directory so `rename(src, dest)` fails with EISDIR (no `chmod` cleanup required). Used in `triage.faults.test.ts:545–592`.
- Success-path `parkForDiscussion` tests live in `tests/engine/triage-priority.test.ts:163–211`. The failure-path test belongs in the same file for locality.
- `makeLogCapturing()` helper at `tests/engine/triage-priority.test.ts:44–52` is the canonical event-capture form.
- Cardinality-pinned assertion convention: `events.filter(predicate).length === 1` (not `find`).
- `src/engine/triage.ts` has a per-file coverage floor of 95%; the catch block at lines 719–721 is currently uncovered.

## Desired End State

- `catch (e) {` at line 719, with `await log.emit('issue.park_failed', { id: raw.id, error: String(e) })` added before `renamed = false`.
- Two new tests in `tests/engine/triage-priority.test.ts`:
  1. Failure path: rename throws → exactly one `issue.park_failed` event, correct payload, no `issue.parked_for_discussion` event, raw file remains in place.
  2. Success-path guard: rename succeeds → zero `issue.park_failed` events (verifies the existing success test already covers this; a targeted assertion added to the existing test suffices).
- `npm test` passes. `npm run test:coverage` passes with `src/engine/triage.ts` at or above 95%.

## What We're NOT Doing

- Changing `parkForDiscussion` control flow: `renamed` still becomes `false`, the raw file still stays in `raw/`, the function still returns normally.
- Adding retry logic, structured alerting, or caller-level handling of the park failure.
- Touching `refl-0228-parkfordiscussion-rename-failure-catch-b` (separate issue for the catch block's broader handling).
- Refactoring `triage.ts` to inject `rename` via DI — real-filesystem fault injection is sufficient and in-scope.
- Adding `issue.park_failed` handling in `runTriage` or anywhere beyond the emit.

## Implementation Approach

Two changes, in order:

1. **Source** (`src/engine/triage.ts`): bind the catch variable (`e`) and add one `await log.emit(...)` call before `renamed = false`. Minimal diff.
2. **Tests** (`tests/engine/triage-priority.test.ts`): add one new test for the failure path (fault injection via pre-creating the destination as a directory). Add one cardinality-pinned assertion to the existing success-path test to assert zero `issue.park_failed` events.

No new files, no new imports beyond what already exists in each file.

---

## Task 1: Emit `issue.park_failed` in `parkForDiscussion` catch block

### Overview

Bind the catch error variable and emit the log event before setting `renamed = false`. No control-flow change.

### Changes Required

**File**: `src/engine/triage.ts`

**Lines 719–721** — current:
```typescript
  } catch {
    renamed = false;
  }
```

Replace with:
```typescript
  } catch (e) {
    await log.emit("issue.park_failed", { id: raw.id, error: String(e) });
    renamed = false;
  }
```

That is the complete source change. No imports needed — `log.emit` is already used at line 723.

### Success Criteria

- [ ] `npm run typecheck` passes with no errors
- [ ] `npm run build` succeeds
- [ ] Existing `npm test` passes (no regressions)

---

## Task 2: Add failure-path and success-path guard tests in `triage-priority.test.ts`

### Overview

Add one new test exercising the `parkForDiscussion` failure path (rename throws → `issue.park_failed` emitted). Add one cardinality-pinned assertion to the existing success-path test confirming zero `issue.park_failed` events when rename succeeds.

### Changes Required

**File**: `tests/engine/triage-priority.test.ts`

**Modification 1 — existing success-path test** (around line 194, after the existing `parked` assertions):

Add this assertion inside the existing test `"discuss raw: agent never called, file moved to discuss/, ..."`:
```typescript
const parkFailed = events.filter((e) => e.event === "issue.park_failed");
assert.equal(parkFailed.length, 0, "no park_failed event on success path");
```

**Modification 2 — new failure-path test** (append after the existing discuss test, before the `"non-discuss raw"` test):

```typescript
test("discuss raw: parkForDiscussion rename fails → issue.park_failed emitted, raw file stays, no parked_for_discussion", async () => {
  const root = await setupRepo();
  try {
    const id = "test-discuss-fail-01";
    await writeFile(
      join(root, "docs/cycle/issues/raw", `${id}.md`),
      rawBody(id, "Discuss this", "discuss"),
      "utf8",
    );

    // Pre-create destPath as a directory so rename(srcPath, destPath) fails with EISDIR.
    const destPath = join(root, "docs/cycle/issues/discuss", `${id}.md`);
    await mkdir(destPath, { recursive: true });

    const runAgent = async (): Promise<TriageAgentResult> => {
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    const { log, events } = makeLogCapturing();
    await runTriage(root, makeConfig(), log, { runAgent });

    // Exactly one park_failed event with correct payload.
    const failed = events.filter((e) => e.event === "issue.park_failed");
    assert.equal(failed.length, 1, "exactly one issue.park_failed event");
    assert.equal(failed[0].fields.id, id, "park_failed id matches raw.id");
    assert.ok(
      typeof failed[0].fields.error === "string" && failed[0].fields.error.length > 0,
      "park_failed error is a non-empty string",
    );

    // No success event emitted.
    const parked = events.filter((e) => e.event === "issue.parked_for_discussion");
    assert.equal(parked.length, 0, "no parked_for_discussion event on failure path");

    // Raw file remains in place (rename failed, not moved).
    const rawContent = await readFile(
      join(root, "docs/cycle/issues/raw", `${id}.md`),
      "utf8",
    );
    assert.ok(rawContent.includes(`id: ${id}`), "raw file still present after rename failure");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

No new imports needed — `mkdir` is already imported at line 6, `writeFile`/`readFile`/`rm` at lines 5/7/9, `join` at line 11, `runTriage`/`TriageAgentResult`/`TriageDeps` at lines 14–17.

### Success Criteria

- [ ] New test appears and passes in `npm test`
- [ ] `events.filter(e => e.event === 'issue.park_failed').length === 1` asserts true on failure path
- [ ] `events.filter(e => e.event === 'issue.parked_for_discussion').length === 0` asserts true on failure path
- [ ] `events.filter(e => e.event === 'issue.park_failed').length === 0` asserts true on success path (added assertion in existing test)
- [ ] Raw file still readable at `raw/<id>.md` after failure
- [ ] `npm run test:coverage` passes; `src/engine/triage.ts` at or above 95% line coverage

---

## Task 3: Verify coverage gate and optionally note in ENGINE.md

### Overview

Run the full coverage suite and confirm the per-file floor for `src/engine/triage.ts` is met. Check whether `docs/ENGINE.md` has a `parkForDiscussion` section worth a one-line note.

### Changes Required

**File**: `docs/ENGINE.md` (conditional)

Search for any `parkForDiscussion` section. If one exists, append:
> Rename failures emit `issue.park_failed` with `{ id, error }` — the raw file remains in place and the function returns normally.

If no such section exists, no ENGINE.md change is required.

### Success Criteria

- [ ] `npm run test:coverage` passes
- [ ] `npm run check:coverage` passes (triage.ts ≥ 95% lines)
- [ ] `npm run check:invariants` passes

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] \`log.emit('issue.park_failed', { id, error })\` fires when \`rename\` throws inside \`parkForDiscussion\`` | Task 1 + Task 2 | Task 1 adds the emit; Task 2 failure-path test asserts it fires |
| `[ ] Event payload contains \`id\` matching \`raw.id\` and \`error\` matching \`String(thrown_error)\`` | Task 2 | `failed[0].fields.id === id` and `error` is a non-empty string from `String(e)` |
| `[ ] Exactly one \`issue.park_failed\` event emitted per rename failure (cardinality-pinned assertion)` | Task 2 | `events.filter(...).length === 1` |
| `[ ] When \`rename\` succeeds, no \`issue.park_failed\` event is emitted` | Task 2 | Added assertion in existing success-path test |
| `[ ] \`npm test\` passes with no regressions` | Tasks 1–3 | Verified after all changes |
| `[ ] \`npm run test:coverage\` passes with no coverage regression on \`src/engine/triage.ts\` (floor: 95%)` | Task 3 | Coverage gate confirms catch block now covered |

---

## Testing Strategy

### Unit Tests

- **Failure path** (new): pre-create `discuss/<id>.md` as a directory → `rename` throws EISDIR → assert `issue.park_failed` length 1, payload shape, no `issue.parked_for_discussion`, raw file still present.
- **Success path guard** (additive assertion to existing test): assert `issue.park_failed` length 0.
- No mocking of `rename` — real filesystem fault injection via directory-as-destination, consistent with `triage.faults.test.ts` pattern.

### Integration / E2E Tests

- `runTriage` is called in both test cases (existing integration harness) — the full triage loop exercises `parkForDiscussion` via the discuss-priority guard at `triage.ts:192–197`. No additional integration test needed beyond the two test cases above.

## Risk Assessment

- **`mock.method` on `node:fs` does not intercept `triage.ts` rename**: Resolved — using real-filesystem fault injection (destination pre-created as directory). No source refactor required.
- **`mkdir({ recursive: true })` inside `parkForDiscussion` creates the `discuss/` parent**: Not a problem — pre-creating `discuss/<id>.md` as a directory is a child of `discuss/`, so `mkdir(discussDir, { recursive: true })` succeeds and leaves `discuss/<id>.md` (directory) in place.
- **Raw file presence assertion after failure**: `runTriage` currently has no post-failure retry in the same invocation for discuss-priority items. The raw file stays at `raw/<id>.md` exactly as written.
- **Coverage floor**: The catch block at lines 719–721 currently has zero coverage. Adding the failure-path test covers it directly. Risk of dropping below 95% is low given the existing success-path test coverage; the new test only adds coverage.
