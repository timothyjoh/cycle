# Must-Fix Items: Cycle 0265

## Summary
1 critical issue, 0 minor issues found in review. The implementation is
correct, well-tested, and well-documented, but `npm run typecheck` fails
with two `TS2345` errors in `src/cli/run-one.ts`. This violates the
CLAUDE.md hard gate ("`npm run typecheck` — no warnings allowed") and the
SPEC acceptance criterion "No compiler/linter warnings introduced
(`npm run typecheck` clean)". BUILD.md claims typecheck is clean; it is
not.

## Tasks

- [x] ### Task 1: Fix the `clearInterval` type mismatch in `reapAndExit`
  **Status:** ✅ Fixed
  **What was done:** Replaced the bare `clearInterval` default at
  `src/cli/run-one.ts:43` with a wrapper that accepts the loose handle
  type — `(h: unknown) => clearInterval(h as ReturnType<typeof setInterval>)`
  — so `ci(poll)` typechecks regardless of whether `si` resolved to the
  injected fake or the real `setInterval`. `ReapDeps.clearIntervalFn`
  signature, the fake-timer test seam, and runtime behavior are unchanged.
  `npm run typecheck` now exits 0 with no output; `npm test` reports
  1158/1158 pass; `src/cli/run-one.ts` coverage holds at 77.59% ≥ 70%.

  **Priority:** Critical
  **Files:** `src/cli/run-one.ts`
  **Problem:** `npm run typecheck` fails with two errors:
  ```
  src/cli/run-one.ts(48,10): error TS2345: Argument of type
    '{ unref?: (() => void) | undefined; }' is not assignable to parameter
    of type 'string | number | Timeout | undefined'.
  src/cli/run-one.ts(57,8): error TS2345: ... (same)
  ```
  The injectable timer seam types `setIntervalFn`/`setTimeoutFn` as
  returning the loose `{ unref?: () => void }` shape (run-one.ts:25–27).
  At run-one.ts:41–43 the defaults fall back to the real timer functions:
  ```ts
  const si = deps.setIntervalFn ?? setInterval;
  const st = deps.setTimeoutFn ?? setTimeout;
  const ci = deps.clearIntervalFn ?? clearInterval;
  ```
  `poll` (the return of `si(...)`) is typed as
  `{ unref?: () => void } | NodeJS.Timeout`, but the default `ci`
  (`clearInterval`) only accepts `NodeJS.Timeout | number | string |
  undefined`. So `ci(poll)` at run-one.ts:48 (the fast-poll exit) and
  run-one.ts:57 (the SIGKILL backstop) do not typecheck. The unit tests
  pass `clearIntervalFn` explicitly, so the failing default path is never
  exercised at test time — and tests run under `--experimental-strip-types`
  which does not type-check — which is why the error slipped past the
  test suite but is caught by `tsc --noEmit`.
  **Fix:** Make the default `clearIntervalFn` accept the loose handle type
  so the call sites typecheck regardless of which branch `si` resolved to.
  Replace run-one.ts:43:
  ```ts
  const ci = deps.clearIntervalFn ?? clearInterval;
  ```
  with:
  ```ts
  const ci = deps.clearIntervalFn ?? ((h: unknown) => clearInterval(h as ReturnType<typeof setInterval>));
  ```
  (Equivalently, declare a shared handle type on `ReapDeps` and use it for
  the `setIntervalFn`/`setTimeoutFn` return and the `poll`/`killTimer`
  locals — but the one-line default-wrapper above is the minimal change and
  keeps the existing injectable-deps test seam intact.) Do not change the
  `ReapDeps.clearIntervalFn` signature (`(handle: unknown) => void`), the
  fake-timer test helper, or runtime behavior.
  **Verify:** `npm run typecheck` exits 0 with no output; `npm test` still
  reports 1158/1158 pass; `npm run test:coverage` keeps
  `src/cli/run-one.ts` ≥ 70% (currently 77.59%). Re-run the three
  `reapAndExit` unit tests (no-children / fast-poll / SIGKILL-backstop) and
  confirm they still pass.
