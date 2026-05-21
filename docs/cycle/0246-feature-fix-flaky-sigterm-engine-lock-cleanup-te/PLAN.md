# Implementation Plan: Cycle 0246

## Overview

Replace the bare `readFile`/`lockExists` assertion at lines 235–241 of the SIGTERM integration test with a `waitForAbsence` poll helper that retries until the lock file disappears or a timeout expires. This eliminates the race between `releaseLock`'s synchronous `unlinkSync` in the child process and the parent's filesystem view after `child.on("exit")` fires.

## Current State (from Research)

- **Fix target**: `tests/cli/engine-lock-integration.test.ts`, lines 235–241 — bare `try { await readFile(lockPath) } catch { lockExists = false }` immediately after `Promise.race` settles on child exit.
- **Structural model**: `waitForLock` (lines 157–169) — same while-loop pattern, polls `readFile` every 100 ms; `waitForAbsence` inverts the success condition and polls `stat` instead.
- **`stat` not yet imported**: `node:fs/promises` import at line 3 currently lacks `stat`; must extend.
- **Test runner is `node:test`**, not Vitest — `node_modules/.bin/vitest` is absent. SPEC's iteration command must be adjusted to `node --test --experimental-strip-types tests/cli/engine-lock-integration.test.ts`.
- **SIGINT test (lines 197–203)** has the same bare pattern but is out of scope per SPEC.
- **`engine-lock.ts` 100% coverage gate** is enforced by `scripts/coverage-gate.mjs`; the fix touches only the test file, so the gate must not regress.
- **5,000 ms `setTimeout` in `Promise.race` (lines 228–233)** guards child-exit wait, not the lock-absence path — it is not in scope for removal.

## Desired End State

- `waitForAbsence(filePath, options)` helper defined in `tests/cli/engine-lock-integration.test.ts`, placed immediately after `waitForLock`.
- Lines 235–241 replaced with a single `await waitForAbsence(lockPath)` call.
- `stat` added to the `node:fs/promises` import.
- No fixed `setTimeout`/sleep in the SIGTERM lock-absence assertion path.
- `npm test` passes; `npm run check:coverage` passes with `engine-lock.ts` at 100% line coverage; `npm run check:invariants` passes.
- Test passes 10 consecutive isolated runs.

## What We're NOT Doing

- Fixing the SIGINT test (lines 197–203) — same pattern, not reported flaky, explicitly out of scope.
- Modifying `src/engine/engine-lock.ts` source code.
- Changing the 5,000 ms `Promise.race` timeout guard for child exit.
- Adding `waitForAbsence` to any test file other than `engine-lock-integration.test.ts`.
- Changing test infrastructure, coverage scripts, or CLAUDE.md.

## Implementation Approach

Single targeted edit to `tests/cli/engine-lock-integration.test.ts`:

1. Extend the `node:fs/promises` import to include `stat`.
2. Define `waitForAbsence` immediately after `waitForLock`, following the same while-loop and option-signature conventions.
3. Replace the 7-line bare assertion block in the SIGTERM test with `await waitForAbsence(lockPath)`.

The poll uses `stat` (throws `ENOENT` on absence) rather than `readFile` (reads content unnecessarily). Non-`ENOENT` errors propagate immediately per SPEC requirement. Timeout default is 2,000 ms, interval default is 50 ms, both configurable.

---

## Task 1: Add `waitForAbsence` poll helper and wire it into the SIGTERM test

### Overview

Extend the `node:fs/promises` import with `stat`, define `waitForAbsence` after `waitForLock`, and replace the bare assertion block at lines 235–241 with a single `await waitForAbsence(lockPath)` call.

### Changes Required

**File**: `tests/cli/engine-lock-integration.test.ts`

**Change 1 — extend import (line 3)**:

```typescript
// before
import { mkdtemp, rm, writeFile, readFile, mkdir, chmod, appendFile } from "node:fs/promises";

// after
import { mkdtemp, rm, writeFile, readFile, mkdir, chmod, appendFile, stat } from "node:fs/promises";
```

**Change 2 — add `waitForAbsence` after `waitForLock` (after line 169)**:

```typescript
async function waitForAbsence(
  filePath: string,
  { timeout = 2_000, interval = 50 }: { timeout?: number; interval?: number } = {},
): Promise<void> {
  let waited = 0;
  while (waited < timeout) {
    try {
      await stat(filePath);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === "ENOENT") return;
      throw e;
    }
    await new Promise((r) => setTimeout(r, interval));
    waited += interval;
  }
  throw new Error(`waitForAbsence: ${filePath} still present after ${timeout} ms`);
}
```

**Change 3 — replace bare assertion block in SIGTERM test (lines 235–241)**:

```typescript
// remove:
let lockExists = true;
try {
  await readFile(lockPath, "utf8");
} catch {
  lockExists = false;
}
assert.equal(lockExists, false, "lock should be absent after SIGTERM");

// replace with:
await waitForAbsence(lockPath);
```

### Success Criteria

- [ ] `node --experimental-strip-types --check tests/cli/engine-lock-integration.test.ts` (or `npm run typecheck`) passes with no type errors
- [ ] `npm test` passes with zero failures
- [ ] `npm run check:coverage` passes with `engine-lock.ts` at 100% line coverage
- [ ] `npm run check:invariants` passes
- [ ] Isolated test passes 10 consecutive times: `for i in $(seq 1 10); do node --test --experimental-strip-types tests/cli/engine-lock-integration.test.ts; done`

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] waitForAbsence` helper is defined in `tests/cli/engine-lock-integration.test.ts` with `timeout` and `interval` options | Task 1 | Helper added with both options, defaults 2000ms/50ms |
| `[ ] Lines 235–241 of the SIGTERM test no longer use the bare `readFile`/`lockExists` pattern; `waitForAbsence(lockPath)` is called instead | Task 1 | 7-line block replaced with single `await waitForAbsence(lockPath)` |
| `[ ] No fixed `setTimeout`/sleep remains in the SIGTERM lock-absence assertion path | Task 1 | `waitForAbsence` uses `setTimeout` only inside its poll loop, not as a fixed delay in the assertion path; the 5,000ms `Promise.race` guard is in the child-exit-wait path, not the lock-absence path |
| `[ ] The isolated test passes in 10 consecutive runs: `node --experimental-strip-types node_modules/.bin/vitest run tests/cli/engine-lock-integration.test.ts --reporter=verbose`` | Task 1 | Vitest absent; correct command is `node --test --experimental-strip-types tests/cli/engine-lock-integration.test.ts` run 10 times |
| `[ ] `npm test` passes with zero failures | Task 1 | |
| `[ ] `npm run check:coverage` passes with `engine-lock.ts` at 100% line coverage | Task 1 | Fix touches only test file; unit tests in `engine-lock.test.ts` independently cover all source branches |
| `[ ] `npm run check:invariants` passes | Task 1 | No structural changes |

---

## Testing Strategy

### Unit Tests

No unit tests to add — `waitForAbsence` is a test helper, not production code. All source branches in `engine-lock.ts` are covered by existing unit tests in `tests/engine/engine-lock.test.ts`.

### Integration / E2E Tests

- Run isolated SIGTERM test 10 consecutive times to confirm determinism:
  ```
  for i in $(seq 1 10); do node --test --experimental-strip-types tests/cli/engine-lock-integration.test.ts && echo "pass $i" || echo "FAIL $i"; done
  ```
- Run full suite: `npm test`
- Verify coverage gate: `npm run check:coverage` — `engine-lock.ts` must remain at 100%
- Verify invariants: `npm run check:invariants`

## Risk Assessment

- **`waitForAbsence` times out on a genuinely stuck lock**: Default 2,000 ms is generous; `releaseLock` is synchronous `unlinkSync` so the delay is purely OS-level filesystem visibility lag. If the child was killed without cleanup, the lock would also be absent (no file to unlink). 2,000 ms is safe.
- **`interval` loop undershoots timeout by up to one `interval`**: The while condition `waited < timeout` exits after the last increment, so actual wait may reach `timeout + interval - 1 ms`. At 50 ms interval this is acceptable for a test helper.
- **Non-ENOENT propagation masking real errors**: The explicit `if (err.code === "ENOENT") return; throw e` ensures permission errors or corrupted state surface immediately rather than timing out — per SPEC requirement.
