# Must-Fix Items: Cycle 0014 (BB-3)

## Summary
2 critical issues, 3 minor issues found in review. Implementation matches
SPEC R1–R6 and coverage clears baseline on a clean run, but the new
integration test suite is non-deterministic under `npm run test:coverage`
and the terminal-failure code path can orphan a file when frontmatter
mutation fails. Minor cleanups requested for code clarity and
test-spec parity.

## Tasks

- [x] ### Task 1: Make `npm run test:coverage` deterministic
  **Priority:** Critical
  **Files:** `tests/cli/queue-drain.test.ts`, `tests/cli/multi-loop.test.ts`
  **Problem:** `tests/cli/queue-drain.test.ts:10-14` defines
  `ensureDist()` as a bare `readFile(distPath)` check that throws if
  `dist/cycle.js` is missing. `tests/cli/multi-loop.test.ts:13-19` (and
  `:44-49`) still contain the legacy auto-build branch:
  ```ts
  try { await readFile(distPath, "utf8"); } catch {
    spawnSync("npm", ["run", "build"], { cwd: REPO, stdio: "inherit" });
  }
  ```
  `npm run build` runs `rm -rf dist` (`scripts/build.mjs:4`). Under
  parallel `node --test`, multi-loop can race queue-drain, deleting
  `dist/cycle.js` mid-run. Confirmed: first `npm run test:coverage`
  invocation in this review produced `Error: Cannot find module
  '.../dist/cycle.js'` for the "ok path" test even though `npm run build`
  succeeded immediately before. BUILD.md (last paragraph) flagged this as
  a known follow-up; the fix belongs in this cycle because coverage is a
  required gate per `CLAUDE.md`.
  **Fix:**
  1. Remove the in-test build fallback from `tests/cli/multi-loop.test.ts`
     in both tests (`:13-19` and `:44-49`). Replace with the same
     `ensureDist`-style read-only check used in queue-drain (fail loud if
     `dist/cycle.js` is missing instead of triggering `rm -rf dist`).
  2. Add `prebuild` discipline at the project level by changing the
     `test` and `test:coverage` scripts in `package.json:14-15` to run
     `node scripts/build.mjs &&` first, OR add `pretest` /
     `pretest:coverage` script entries that invoke `node
     scripts/build.mjs`. Pick one; ensure the build runs once,
     sequentially, before any test file starts.
  3. Document in `CLAUDE.md` "Commands" table that `npm test` /
     `npm run test:coverage` build the bundle automatically; manual
     `npm run build` is no longer needed before tests.
  **Verify:** Delete `dist/`, then run `npm run test:coverage` three
  times back-to-back. All 135 tests pass every run. `dist/cycle.js`
  exists after each run. No `Cannot find module` error.

  **Status:** ✅ Fixed
  **What was done:** Replaced the in-test `npm run build` fallbacks in
  `tests/cli/multi-loop.test.ts` with a read-only `ensureDist()` helper.
  Added `pretest` and `pretest:coverage` script entries in
  `package.json` that invoke `node scripts/build.mjs` once before the
  test runner starts. Updated the `CLAUDE.md` "Commands" table to
  document the auto-build. **Also discovered and fixed** a secondary
  source of the same race: `tests/build.test.ts` was itself calling
  `npm run build` from inside a test (`rm -rf dist` then esbuild),
  racing other test files in parallel; rewrote it to assert against
  the existing `dist/cycle.js` produced by `pretest`. Verified by
  `rm -rf dist && npm run test:coverage` three consecutive times — 137
  tests pass every run.

- [x] ### Task 2: Don't orphan the failed file when frontmatter mutation throws
  **Priority:** Critical
  **Files:** `src/cli.ts:125-138`
  **Problem:** The terminal-failure branch in `src/cli.ts:125-144`
  reads:
  ```ts
  try {
    await mutateFrontmatter(todoPath, ...);
    await rename(todoPath, join(failedDir, `${row.id}.md`));
  } catch {
    // tolerate missing file
  }
  await drainFailedTerminal(cwd, row.id);
  await propagateBlocked(cwd, row.id);
  ```
  If `mutateFrontmatter` throws (e.g. the todo file has no frontmatter,
  or its frontmatter does not end with `\n---\n` — see
  `src/engine/frontmatter.ts:8` and `:23`), the rename is skipped, the
  comment-only catch swallows the error, and `drainFailedTerminal`
  removes the queue row anyway. End state: file stranded in `todo/`
  with no queue row tracking it. The engine will not retry it; a fresh
  `scanRaw` won't re-add it (raw/ is empty); the failed file is invisible.
  The intent of the broad catch is "tolerate file already moved by the
  workflow itself" — but the current shape silently masks every error
  including parse failure.
  **Fix:** Tighten the catch to file-not-found only, and split the
  mutate/rename pair so a failed mutate does not skip the rename. Suggested
  shape:
  ```ts
  let mutateErr: Error | null = null;
  try {
    await mutateFrontmatter(todoPath, (fm) => ({
      ...fm,
      failed_at: new Date().toISOString(),
      failed_step: r.failingStep ?? "unknown",
      failed_attempts: failedAttempts,
    }));
  } catch (e) {
    mutateErr = e as Error;
  }
  try {
    await rename(todoPath, join(failedDir, `${row.id}.md`));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  if (mutateErr) {
    await log.emit("queue.drain_warning", {
      cycle_id: cycleId,
      issue_id: row.id,
      reason: `mutateFrontmatter failed: ${mutateErr.message}`,
    });
  }
  ```
  The row is still drained and `propagateBlocked` still fires, but the
  failure is auditable in `log.jsonl` instead of silently lost.
  **Verify:** Add `tests/cli/queue-drain.test.ts` case: write a todo file
  with no frontmatter (e.g. `body only\n`), set `max_cycle_attempts: 1`
  and a failing step. Run `node dist/cycle.js run`. Assert:
  1. File ends up in `failed/<id>.md` (rename still ran).
  2. `.cycle/log.jsonl` contains a `queue.drain_warning` event for the
     id.
  3. `.cycle/tbd.jsonl` row is removed.

  **Status:** ✅ Fixed
  **What was done:** Split the terminal-failure block in
  `src/cli.ts:125-150` so a failed `mutateFrontmatter` no longer
  short-circuits the `rename` call. The `rename` catch now only
  swallows `ENOENT` (the legitimate "already moved by workflow" case)
  and rethrows any other error. A `queue.drain_warning` event is
  emitted to `.cycle/log.jsonl` when frontmatter mutation fails so the
  loss is auditable instead of silent. Added the
  "terminal failure with malformed frontmatter" integration test
  case in `tests/cli/queue-drain.test.ts` covering all three
  acceptance assertions (file moves, warning logged, row removed).

- [x] ### Task 3: Strengthen `propagateBlocked` assertion in integration test
  **Priority:** Minor
  **Files:** `tests/cli/queue-drain.test.ts:100-128`
  **Problem:** SPEC acceptance criterion: "`propagateBlocked` is called
  from the terminal-failure path (verified by spy/stub even though its
  body is no-op for this cycle)." The current terminal-failure test
  relies only on the `queue.drained outcome:terminal` event as a proxy,
  which is emitted before `propagateBlocked` is awaited (cli.ts:138-140).
  A future regression that drops the `propagateBlocked` call would not
  trip the test.
  **Fix:** Add an explicit assertion. Two acceptable approaches:
  1. Make `propagateBlocked` emit a `queue.propagate_blocked` log event
     (one line in `src/engine/blocked.ts`) and assert that event appears
     in the integration test.
  2. Or move the `await propagateBlocked(...)` call BEFORE the
     `queue.drained` emit so event ordering is enforced (then assert
     `propagateBlocked` ran by checking `queue.drained` follows it). Less
     explicit; prefer option 1.
  Use option 1.
  **Verify:** Inspect `.cycle/log.jsonl` in the terminal-failure test —
  assert a `queue.propagate_blocked` event exists with the failed
  `issue_id`.

  **Status:** ✅ Fixed
  **What was done:** Extended `propagateBlocked` in
  `src/engine/blocked.ts` to accept an optional `Logger` and emit a
  `queue.propagate_blocked` event with `{ issue_id, blocked: [] }`.
  Updated the terminal-failure branch in `src/cli.ts` to pass the
  engine logger to `propagateBlocked`. Added a unit test in
  `tests/engine/blocked.test.ts` to assert the event shape, and an
  explicit assertion in the integration "terminal failure" test in
  `tests/cli/queue-drain.test.ts` that `queue.propagate_blocked` is
  emitted with the correct `issue_id`.

- [x] ### Task 4: Remove redundant dynamic import in dry-run path
  **Priority:** Minor
  **Files:** `src/cli.ts:62`
  **Problem:** `src/cli.ts:10-16` statically imports `popNextPending`,
  `markInProgress`, `drainOk`, `drainFailedRetry`, `drainFailedTerminal`
  from `./engine/queue.ts`. Line 62 dynamically re-imports the same
  module just to grab `readQueue`:
  ```ts
  const { readQueue } = await import("./engine/queue.ts");
  ```
  Trivial waste; obscures the dependency surface; differs from the
  consistent static-import style used everywhere else in the file.
  **Fix:** Add `readQueue` to the static `import { ... } from
  "./engine/queue.ts"` block at the top of `src/cli.ts` and remove the
  dynamic import on line 62.
  **Verify:** `npm test` green. `grep -n "await import" src/cli.ts` shows
  no remaining hits.

  **Status:** ✅ Fixed
  **What was done:** Added `readQueue` to the static
  `import { ... } from "./engine/queue.ts"` block at the top of
  `src/cli.ts` and removed the dynamic `await import("./engine/queue.ts")`
  on the dry-run path. `grep -n "await import" src/cli.ts` returns
  zero hits.

- [x] ### Task 5: Remove dead `?? "unknown"` fallback or pin it with a test
  **Priority:** Minor
  **Files:** `src/cli.ts:131`
  **Problem:** `failed_step: r.failingStep ?? "unknown"` (cli.ts:131).
  `runCycle` only returns a result with `status: "failed"` from
  `src/engine/run-cycle.ts:64`, and that return always includes
  `failingStep: step.name`. The `?? "unknown"` branch is unreachable in
  current code paths.
  **Fix:** Either:
  1. Drop the `?? "unknown"` and let `failed_step` be `step.name`
     directly (preferred — less dead code), OR
  2. Add a unit test that exercises the path where `failingStep` is
     undefined (e.g. mock `runCycle` to return `{status:"failed"}` with
     no `failingStep`) and document why the fallback exists.
  Pick option 1.
  **Verify:** `npm test` green. `grep -n 'failed_step:' src/cli.ts`
  shows no `??`.

  **Status:** ✅ Fixed
  **What was done:** Dropped the `?? "unknown"` fallback (option 1).
  `src/cli.ts` now assigns `failed_step: r.failingStep` directly;
  `runCycle` always populates `failingStep` when `status === "failed"`.
  `grep -n 'failed_step:' src/cli.ts` shows no `??`.

## Acceptance for fix step
Run after all tasks:
1. `rm -rf dist && npm run test:coverage` (three times). All passes;
   no missing-dist errors.
2. `npm run typecheck` → only the pre-existing `findLast` errors in
   `tests/cli/multi-loop.test.ts` (obs #498) remain.
3. Coverage on per-file basis still ≥95 line / ≥75 branch / ≥90 func.
4. `git diff` minimal: cli.ts + frontmatter test + scripts (package.json)
   + multi-loop test + queue-drain test + blocked.ts (event emit).
