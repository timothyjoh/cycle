# Must-Fix Items: Cycle 0228

## Summary
1 critical issue, 1 minor issue found in review.

## Tasks

- [x] ### Task 1: `all_triage_failed` halt bypassed when discuss raws and failing normal raws coexist
  **Status:** ✅ Fixed
  **What was done:** Computed `actionableCount = raws.filter(r => r.fm.priority !== "discuss").length` immediately before the guard and changed the condition at `triage.ts:235` from `failed.length === raws.length` to `actionableCount > 0 && failed.length === actionableCount`. Added test "discuss + all normal fail → engine.paused emitted, normal raw stays in raw/" to `triage-priority.test.ts` confirming `engine.paused{all_triage_failed}` is emitted and the normal raw is not moved to `failed/`.
  **Priority:** Critical
  **Files:** `src/engine/triage.ts`, `tests/engine/triage-priority.test.ts`
  **Problem:** `runTriage`'s all-fail guard at `triage.ts:235` is `failed.length === raws.length`. The `raws` array includes discuss raws, but discuss raws are never added to `failed` (they are parked and `continue`d). Result: when a batch contains at least one discuss raw AND all non-discuss raws fail, `failed.length < raws.length` and the condition is false. The engine does NOT emit `engine.paused{reason: "all_triage_failed"}` and does NOT reset attempt counters. Instead, the failed normal raws fall through to the partial-failure path at `triage.ts:262`, which calls `moveToFailed` and permanently moves them to `failed/`. This silently discards issues that should have stayed in `raw/` for operator inspection.

  **Fix:**
  1. Before the `all_triage_failed` check, compute the count of raws that actually went through the normal path:
     ```typescript
     const actionableCount = raws.filter(r => r.fm.priority !== "discuss").length;
     ```
  2. Change the guard at line 235 from:
     ```typescript
     if (failed.length === raws.length) {
     ```
     to:
     ```typescript
     if (actionableCount > 0 && failed.length === actionableCount) {
     ```
     The `actionableCount > 0` guard prevents a vacuous true when all raws are discuss (0 === 0).

  **Verify:**
  - Add a test "discuss + all normal fail → engine.paused emitted, normal raw stays in raw/" to `tests/engine/triage-priority.test.ts`:
    1. Write one discuss raw and one normal raw to `raw/`.
    2. `runAgent` always returns `{ exitCode: 1, stdout: "", stderr: "boom" }` (failure).
    3. Call `runTriage` with `makeLogCapturing()`.
    4. Assert `events.some(e => e.event === "engine.paused" && e.fields.reason === "all_triage_failed")`.
    5. Assert the normal raw file still exists in `raw/` (not moved to `failed/`).
    6. Assert the discuss raw file exists in `discuss/` (parked before the agent call).
  - `npm test` passes with 0 failures.
  - `npm run check:coverage` passes (triage.ts ≥ 95%).

- [x] ### Task 2: `parkForDiscussion` emits `issue.parked_for_discussion` even when `rename` silently failed
  **Status:** ✅ Fixed
  **What was done:** Introduced a `renamed` boolean flag in `parkForDiscussion`. The `rename` call sets it to `false` on catch instead of swallowing the error silently. The `log.emit("issue.parked_for_discussion", …)` call is now guarded by `if (renamed)`, so the event is only emitted when the file was actually moved.
  **Priority:** Minor
  **Files:** `src/engine/triage.ts`
  **Problem:** `parkForDiscussion` at `triage.ts:714–723` wraps `rename` in a try/catch that swallows errors, then unconditionally emits the `issue.parked_for_discussion` event with `path` pointing to `discuss/<id>.md`. If `rename` threw (e.g., the source file was removed mid-flight), the event is emitted with an inaccurate `path` — the file is not actually in `discuss/`. Operators reading the log would believe the file was parked when it was not.
  **Fix:** Guard the `log.emit` call on whether the rename succeeded:
  ```typescript
  let renamed = true;
  try {
    await rename(raw.srcPath, destPath);
  } catch {
    renamed = false;
  }
  if (renamed) {
    await log.emit("issue.parked_for_discussion", {
      id: raw.id,
      priority: "discuss",
      path: destPath,
    });
  }
  ```
  **Verify:**
  - `npm run typecheck` passes.
  - The existing discuss routing test (Test 1, `triage-priority.test.ts:163`) still passes — rename succeeds in normal flow so event is still emitted.
  - No regression in `npm run check:coverage`.
