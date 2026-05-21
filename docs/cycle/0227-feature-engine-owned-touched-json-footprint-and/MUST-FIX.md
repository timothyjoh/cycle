# Must-Fix Items: Cycle 0227

## Summary
1 critical issue, 2 minor issues found in review.

## Tasks

- [x] ### Task 1 (Unbacked Doc Claim): Remove stale Scope Guard section from ENGINE.md
  **Priority:** Critical
  **Files:** `docs/ENGINE.md`
  **Problem:** Lines 193–201 still document the deleted blocking `scopeGuard` behavior:
  - Line 193: "`parseTouchedFiles` / `scopeGuard` in `src/engine/commit-cycle.ts`" — `scopeGuard` no longer exists; `commit-cycle.ts` has no such function.
  - Lines 194–197: describes `commitCycle()` returning `{ status: "failed", reason: "scope_violation", blockedFiles }` — `CommitResult` has no `scope_violation` variant.
  - Lines 198–199: "Guard is a no-op when BUILD.md is absent..." — refers to deleted guard logic.
  - Lines 201–201: "**BUILD.md contract**: Build agents must append a `## Touched Files` YAML list... The scope guard reads it at commit time." — `commitCycle` no longer reads BUILD.md for scope purposes; scope now comes from `touched.json`.
  This section directly contradicts the new `## touched.json footprint` section at line 118, which states "The previous blocking `scopeGuard` function... have been removed entirely."
  **Fix:** Delete `docs/ENGINE.md` lines 193–201 in their entirety (from the `**Scope guard**` bold header through the `**BUILD.md contract**` paragraph). The `## touched.json footprint` section already documents the replacement behavior completely.
  **Verify:** `grep -n "scopeGuard\|scope_violation\|scope guard" docs/ENGINE.md` returns zero matches. `grep -n "touched.json" docs/ENGINE.md` returns the existing section at line 106.
  **Status:** ✅ Fixed
  **What was done:** Deleted the 9-line `**Scope guard**` block (lines 193–201) from `docs/ENGINE.md`. The remaining reference to `scopeGuard` at line 118 is in the `## touched.json footprint` section that correctly describes the removal.

- [x] ### Task 2: Add structural invariant asserting `commit-scope-guard-loop` is absent from `src/`
  **Priority:** Minor
  **Files:** `scripts/structural-invariants.mjs`
  **Problem:** SPEC testing strategy item 4 explicitly requires "grep-based assertion or structural invariant that `commit-scope-guard-loop` string does not appear in `src/`". No such invariant was added to `scripts/structural-invariants.mjs`. The CLAUDE.md policy states the `INVARIANTS` table is the single source of truth for build-time structural rules. Without this guard, the string can be silently reintroduced.
  **Fix:** Add two entries to the `INVARIANTS` array in `scripts/structural-invariants.mjs`:
  ```javascript
  {
    file: 'src/cli.ts',
    pattern: /commit-scope-guard-loop/g,
    expected: 0,
    reason: 'commit-scope-guard-loop halt path removed in cycle 0227',
  },
  {
    file: 'src/engine/commit-cycle.ts',
    pattern: /scopeGuard/g,
    expected: 0,
    reason: 'blocking scopeGuard removed in cycle 0227',
  },
  ```
  Also update `tests/scripts/coverage-gate.test.ts` if the structural-invariants test fixture needs updating (check whether it uses a mock of the INVARIANTS file).
  **Verify:** `npm run check:invariants` passes and prints two new `ok` lines for these invariants. `grep -c "commit-scope-guard-loop\|scopeGuard" scripts/structural-invariants.mjs` returns 2.
  **Status:** ✅ Fixed
  **What was done:** Added two entries to `INVARIANTS` in `scripts/structural-invariants.mjs`: one asserting `commit-scope-guard-loop` appears 0 times in `src/cli.ts`, one asserting `scopeGuard` appears 0 times in `src/engine/commit-cycle.ts`. Updated test fixture setup in `tests/scripts/structural-invariants.test.ts` to scaffold the two new files so the violation/clean tests still function correctly.

- [x] ### Task 3: Extract duplicated pre-snapshot parsing into a shared helper
  **Priority:** Minor
  **Files:** `src/engine/run-cycle.ts`
  **Problem:** The SPEC requirement states "Snapshot logic reuses the helper already present for the documentation step rather than duplicating it." The pre-snapshot parsing block (lines 115–127 in `accumulateTouchedFiles`) is ~13 lines of code that are structurally identical to lines 59–71 in `appendDocumentationPaths`. If the git status parsing logic needs to change (new XY codes, quoted-path handling), it must be updated in both places.
  **Fix:** Extract a module-local helper before `appendDocumentationPaths`:
  ```typescript
  function parseSnapshotPaths(snapshot: string): Set<string> {
    const paths = new Set<string>();
    for (const raw of snapshot.split("\n")) {
      if (!raw) continue;
      const xy = raw.slice(0, 2);
      if (xy === "??") continue;
      let p = raw.slice(3);
      if (xy[0] === "R" || xy[0] === "C") {
        const arrow = p.lastIndexOf(" -> ");
        if (arrow !== -1) p = p.slice(arrow + 4);
      }
      p = p.replace(/^"/, "").replace(/"$/, "");
      paths.add(p);
    }
    return paths;
  }
  ```
  Replace the inline parsing in `appendDocumentationPaths` (lines 59–71) with `const prePaths = parseSnapshotPaths(preSnapshot);` and do the same in `accumulateTouchedFiles` (lines 115–127). Apply the same refactor to the post-snapshot loop in `accumulateTouchedFiles` (lines 134–147) — extract a `parseSnapshotFiles(snapshot: string, prePaths: Set<string>): string[]` that also applies `isDenied` and the `!prePaths.has(p)` filter, or inline it as `parseSnapshotPaths` on the post side followed by a filter.
  **Verify:** `npm test` passes with 0 failures. `npm run typecheck` exits clean. Behavior is unchanged — the refactor is pure extraction with no logic change. `grep -c "for (const raw of.*split" src/engine/run-cycle.ts` returns 1 (consolidated to shared helper).
  **Status:** ✅ Fixed
  **What was done:** Extracted `parseSnapshotPaths(snapshot: string): Set<string>` module-local helper before `appendDocumentationPaths`. Replaced all three inline parsing loops: pre-snapshot in `appendDocumentationPaths`, pre-snapshot in `accumulateTouchedFiles`, and post-snapshot in both functions (using `.filter()` chains to preserve `isDenied`, `!prePaths.has`, and `!touchedSet.has` guards). Single `for (const raw of.*split` loop now lives only in the helper.
