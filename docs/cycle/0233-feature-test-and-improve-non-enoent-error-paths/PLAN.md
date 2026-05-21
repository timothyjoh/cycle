# Implementation Plan: Cycle 0233

## Overview

Wrap the bare `await rename(path, archive)` call in `bootstrapArchiveIfLegacy` with a `try/catch` that rethrows non-ENOENT errors with a structured diagnostic message, and add a `mock.method`-based test that injects an `EACCES` failure on `rename` to cover the previously untested error branch.

## Current State (from Research)

- `bootstrapArchiveIfLegacy` in `src/engine/queue.ts:150` calls `await rename(path, archive)` with no error handling — any failure propagates as a bare `Error` with no function context.
- `src/engine/dot-env.ts:7–15` establishes the canonical wrapping pattern: `Object.assign(new Error(\`<context>: <original message>\`), { code: err.code })`.
- `tests/engine/queue.test.ts` imports `test` from `"node:test"` but not `mock`; imports `node:fs/promises` destructured but not as a namespace. Both must be added.
- Current branch coverage for `queue.ts`: 103/114 = 90.4% — exactly at floor. The new try/catch adds ~2 new branches; both are covered by existing test (success path) and new test (failure path), keeping coverage ≥ 90%.
- `docs/ENGINE.md` has no Known Limitation note for `bootstrapArchiveIfLegacy` rename errors — no documentation retirement needed.

## Desired End State

- `bootstrapArchiveIfLegacy` wraps the `rename` call: a non-ENOENT failure becomes `Error("bootstrapArchiveIfLegacy: rename failed: <original>")` with `.code` preserved.
- `tests/engine/queue.test.ts` contains one new test that stubs `nodeFsPromises.rename` to throw `EACCES`, seeds a legacy file to reach the rename path, and asserts rejection with `"bootstrapArchiveIfLegacy: rename failed:"` in the message.
- `npm run test:coverage` and `npm run check:coverage` both pass with `src/engine/queue.ts` at or above 90%.
- `npm run typecheck` passes with no new errors.

## What We're NOT Doing

- Wrapping the `readFile` rethrow at lines 132–133 (out of scope per SPEC).
- Adding coverage for the JSON.parse catch block at lines 141–142 (out of scope).
- Structured engine halt or event emission on startup failure (separate cycle).
- Updating ENGINE.md (no Known Limitation note exists for this path).
- Changing any other queue functions or broader error-handling patterns.

## Implementation Approach

Two minimal, sequential changes: first the production wrap (Task 1), then the test (Task 2). The wrap follows the `dot-env.ts` `Object.assign` pattern exactly. The test follows the `dot-env.test.ts` `mock.method` namespace-import pattern, adapted for `node:fs/promises` async `rename`.

---

## Task 1: Wrap `rename` in `bootstrapArchiveIfLegacy`

### Overview

Add a `try/catch` around line 150 of `src/engine/queue.ts` that catches any error thrown by `rename`, wraps it with a structured message, and rethrows.

### Changes Required

**File**: `src/engine/queue.ts`

**Change**: Replace the bare `await rename(path, archive)` at line 150 with:

```typescript
  try {
    await rename(path, archive);
  } catch (e: unknown) {
    throw Object.assign(
      new Error(`bootstrapArchiveIfLegacy: rename failed: ${(e as Error).message}`),
      { code: (e as NodeJS.ErrnoException).code }
    );
  }
```

No import changes needed — `rename` is already imported at line 1.

### Success Criteria

- [ ] `npm run typecheck` passes with no new errors.
- [ ] `npm run build` succeeds.
- [ ] Existing `bootstrapArchiveIfLegacy` tests still pass (the success path through the try block is unchanged).

---

## Task 2: Add mock-based test for `rename` failure

### Overview

Extend `tests/engine/queue.test.ts` with two new imports and one new test case that stubs `rename` via `mock.method`, reaches the catch branch, and asserts the wrapped error message.

### Changes Required

**File**: `tests/engine/queue.test.ts`

**Change 1** — update import at line 1 to add `mock`:

```typescript
import { test, mock } from "node:test";
```

**Change 2** — add namespace import for `node:fs/promises` after line 3 (after the destructured import):

```typescript
import * as nodeFsPromises from "node:fs/promises";
```

**Change 3** — append a new test after the last `bootstrapArchiveIfLegacy` test (after line 157):

```typescript
test("bootstrapArchiveIfLegacy: non-ENOENT rename error is wrapped with context", async () => {
  const root = await setupRoot();
  const fakeErr = Object.assign(new Error("permission denied"), { code: "EACCES" });
  const m = mock.method(nodeFsPromises, "rename", async () => {
    throw fakeErr;
  });
  try {
    const seed =
      JSON.stringify({ id: "OLD", source: "text", title: "t", path: "/p", added_at: "y" }) + "\n";
    await writeFile(join(root, ".cycle/tbd.jsonl"), seed, "utf8");
    await assert.rejects(
      () => bootstrapArchiveIfLegacy(root),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok((err as Error).message.includes("bootstrapArchiveIfLegacy: rename failed:"));
        assert.equal((err as NodeJS.ErrnoException).code, "EACCES");
        return true;
      }
    );
  } finally {
    m.mock.restore();
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria

- [ ] New test passes in isolation.
- [ ] `npm run test:coverage` passes with no test failures.
- [ ] `npm run check:coverage` passes — `src/engine/queue.ts` branch coverage stays ≥ 90%.
- [ ] All existing `bootstrapArchiveIfLegacy` tests still pass.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] bootstrapArchiveIfLegacy` wraps a non-ENOENT `rename` error with message prefix `bootstrapArchiveIfLegacy: rename failed:` and preserves the original `.code` on the thrown error. | Task 1 | `Object.assign` pattern mirrors `dot-env.ts`. |
| `[ ] tests/engine/queue.test.ts` contains a test case that stubs `rename` to throw `{ code: "EACCES" }` and asserts the rejection message includes `"bootstrapArchiveIfLegacy: rename failed:"`. | Task 2 | Also asserts `.code === "EACCES"`. |
| `[ ] npm run test:coverage` passes with no test failures. | Task 2 | Verified by full suite run. |
| `[ ] npm run check:coverage` passes — `src/engine/queue.ts` meets the 90% per-file floor. | Task 2 | Coverage math: 103/114 → ~105/116 = 90.5% after new branches fully covered. |
| `[ ] npm run typecheck` passes with no new errors. | Task 1 | `(e as Error).message` and `(e as NodeJS.ErrnoException).code` are type-safe casts consistent with project patterns. |
| `[ ] All existing tests still pass. | Task 2 | Existing tests unchanged; mock is restored in `finally`. |

---

## Testing Strategy

### Unit Tests

- **Primary scenario**: legacy-seeded queue file exists, `rename` stubs to throw `EACCES` → assert rejection with `"bootstrapArchiveIfLegacy: rename failed:"` prefix and `.code === "EACCES"`.
- **Mock setup**: `mock.method(nodeFsPromises, "rename", async () => { throw fakeErr; })` — async stub for async target; ESM live-binding interception confirmed working in this repo (cycle 0232).
- **Mock teardown**: `m.mock.restore()` in `finally` block — consistent with `dot-env.test.ts:114`.
- **No mocking of `readFile` or `pickArchivePath`** — real filesystem used up to the `rename` call; seed file written to temp dir.

### Integration / E2E Tests

- Covered by existing tests: "archives legacy file once" exercises the full happy-path through the new `try` block with a real rename.
- No additional E2E tests needed — the function is an internal startup helper, not a CLI endpoint.

## Risk Assessment

- **ESM live-binding interception for `node:fs/promises`**: confirmed working by analogy with `node:fs` in cycle 0232; if Node's module system caches the destructured binding before mock.method patches the namespace, the stub will not intercept. Mitigation: use `async () => { throw fakeErr; }` (not `() => { throw fakeErr; }`) for correctness with async callers; if interception fails the test will time out rather than give a false positive, making the failure visible.
- **Branch coverage floor**: adding an uncovered ENOENT branch on rename (i.e., if Node adds a branch for the ENOENT case in the new catch) is not expected since the catch wraps unconditionally — no ENOENT check inside it. All new branches introduced are covered by existing (success) and new (failure) tests.
