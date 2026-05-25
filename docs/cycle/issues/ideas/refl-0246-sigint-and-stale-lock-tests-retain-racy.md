---
id: refl-0246-sigint-and-stale-lock-tests-retain-racy
title: Apply waitForAbsence to SIGINT and stale-lock test sites in engine-lock-integration.test.ts
workflow: feature
depends_on: []
triaged_at: "2026-05-21T23:49:49.710Z"
source: triage
priority: low
---
## Background

Cycle 0246 fixed the SIGTERM test in `tests/cli/engine-lock-integration.test.ts` by replacing the bare `readFile` assertion pattern with `waitForAbsence(lockPath)`. Two sibling tests still use the old pattern and share the same structural race condition.

## Problem

The SIGINT test (lines 216–222) and stale-lock test (lines 99–105) both assert lock absence immediately after a process-exit event fires, before the async `unlink` may have propagated to the filesystem:

```ts
try {
  await readFile(lockPath)
} catch {
  lockExists = false
}
expect(lockExists).toBe(false)
```

Under load or slow CI this can fail non-deterministically. These paths have not been reported flaky yet, but they share the same structural race that made the SIGTERM test flaky in cycle 0246.

## Fix

Apply `waitForAbsence(lockPath)` to both remaining sites, following the same pattern established in cycle 0246. The helper already exists in the same file — no new design decisions required.

## Acceptance criteria

- SIGINT test (lines ~216–222) uses `waitForAbsence(lockPath)` instead of bare `readFile` try/catch
- Stale-lock test (lines ~99–105) uses `waitForAbsence(lockPath)` instead of bare `readFile` try/catch
- All existing tests pass (`npm test`)
- Coverage gates pass (`npm run test:coverage`)
- No remaining bare `readFile` lock-absence assertions in `tests/cli/engine-lock-integration.test.ts`
