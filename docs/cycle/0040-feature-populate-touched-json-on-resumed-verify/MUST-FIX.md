# Must-Fix Items: Cycle 0040

## Summary
0 critical issues, 1 minor issue found in review. The feature (resume/verify-only
`touched.json` recovery) is correct, well-tested (100% line coverage on
`run-cycle.ts`), and fully documented. The single minor issue is an unintended
behavioral divergence in the *non-resume* path introduced by the parser
extraction, which violates the SPEC's "byte-for-byte unchanged normal path"
requirement and contradicts PLAN.md Task 1's stated intent.

## Tasks

- [x] ### Task 1: Restore `appendDocumentationPaths` absent-header early-return semantics
  **Status:** ✅ Fixed
  **What was done:** Replaced the post-extraction guard `if (touchedSet.size === 0) return;`
    at `src/engine/run-cycle.ts:134` with the original header-presence test
    `if (headerIdx === -1) return;` (moved above the `parseTouchedFilesSection`
    call). `touchedSet` may now legitimately be empty (header present, no bullets)
    and the downstream `toAppend`/splice logic handles that case unchanged,
    restoring the pre-0040 auto-append behavior for a present-but-empty header.
    Added regression test "documentation step appends under a present-but-empty
    Touched Files header (no bullets)" in
    `tests/engine/run-cycle.documentation.test.ts`: seeds a BUILD.md emitting
    `## Touched Files` immediately followed by another `##` section (zero bullets)
    plus an out-of-scope README.md change, and asserts README.md is appended and
    `documentation.paths_appended` fires.
  **Priority:** Minor
  **Files:** `src/engine/run-cycle.ts`
  **Problem:** The parser extraction changed the early-return guard in
    `appendDocumentationPaths`. The original guard was
    `if (headerIdx === -1) return;` (`run-cycle.ts:132` still computes
    `headerIdx`), which returned **only** when the `## Touched Files` header was
    absent. The refactor replaced it with `if (touchedSet.size === 0) return;`
    (`src/engine/run-cycle.ts:134`), which **also** returns when the header is
    *present but lists no `- ` bullets*. In that case the old code fell through
    and auto-appended discovered working-tree paths under the header (emitting
    `documentation.paths_appended`); the new code now returns early and appends
    nothing. This is exactly the under-reporting case the auto-append safety net
    targets, so the safety net is now disabled for it. SPEC.md:37 requires "The
    normal (non-resumed) build path is byte-for-byte unchanged"; PLAN.md:90
    explicitly directed "preserving the existing absent-header early return (the
    prior `headerIdx === -1` guard)". The divergence is untested — no existing
    test seeds a present-but-empty `## Touched Files` header.
  **Fix:** Change the guard at `src/engine/run-cycle.ts:134` back to the
    header-presence test, keeping the shared parser for building `touchedSet`:
    replace `if (touchedSet.size === 0) return;` with `if (headerIdx === -1) return;`.
    `touchedSet` may then legitimately be empty (header present, no bullets) and
    the downstream `toAppend`/splice logic (`run-cycle.ts:144-159`) handles that
    exactly as the pre-cycle code did. Add a regression test seeding a BUILD.md
    with a `## Touched Files` header followed immediately by another `##` (or
    EOF) plus an out-of-scope tracked/untracked working-tree change, and assert
    the discovered path is appended and `documentation.paths_appended` fires.
  **Verify:** New test passes; `npm test` stays green; with the present-but-empty
    header seed, `BUILD.md` gains the discovered bullet and the
    `documentation.paths_appended` event is emitted (matching pre-0040 behavior).
