# Must-Fix Items: Cycle 0022

## Summary
0 critical issues, 1 minor issue found in review. The code relocation is
correct, all gates pass, and the SPEC acceptance criteria are met. The single
issue is an unfulfilled PLAN Task 3 commitment that left a now-incorrect
documentation statement in `docs/ENGINE.md`.

## Tasks

- [x] ### Task 1: Update stale `docs/ENGINE.md` references to the StepResult home
  **Status:** ✅ Fixed
  **What was done:** Edited `docs/ENGINE.md:309` so it now reads
    "(defined in `src/engine/exec-types.ts`, re-exported from `exec-bash.ts`
    for backwards compatibility)" and added `exec-types` to the engine-modules
    enumeration at `docs/ENGINE.md:7` (inserted adjacent to `exec-bash`). Both
    Verify greps pass: the `defined in \`src/engine/exec-bash.ts\`` pattern
    returns no match, and `exec-types` matches lines 7 and 309. `npm run
    typecheck` exits 0 and `npm test` is green (881/881).
  **Priority:** Minor
  **Files:** `docs/ENGINE.md`
  **Problem:** PLAN.md Task 3 (lines 212-213, 217) explicitly committed to
    updating `docs/ENGINE.md` so it no longer states `StepResult` is "defined
    in `src/engine/exec-bash.ts`" and to optionally add `exec-types` to the
    engine-modules list at line 7. The diff does not touch `docs/ENGINE.md`.
    Two stale references remain:
    1. `docs/ENGINE.md:309` reads: `` `StepResult` (defined in
       `src/engine/exec-bash.ts`) has an optional `rateLimited?: true`
       field. `` — this is now factually incorrect: after this cycle
       `StepResult` is *defined* in `src/engine/exec-types.ts` and only
       *re-exported* from `exec-bash.ts`.
    2. `docs/ENGINE.md:7` engine-modules list omits `exec-types`.
    BUILD.md (lines 320, 324) claims "All PLAN.md tasks are complete" and
    "No deviations from PLAN.md," which is inaccurate for the ENGINE.md
    portion of Task 3.
  **Fix:**
    1. Edit `docs/ENGINE.md:309` so it names `src/engine/exec-types.ts` as the
       definition site (re-exported from `exec-bash.ts` for backwards
       compatibility) — e.g. change "(defined in `src/engine/exec-bash.ts`)"
       to "(defined in `src/engine/exec-types.ts`, re-exported from
       `exec-bash.ts`)".
    2. Add `exec-types` to the engine-modules enumeration at
       `docs/ENGINE.md:7` (e.g. insert it adjacent to `exec-bash`).
  **Verify:**
    - `grep -n "defined in \`src/engine/exec-bash.ts\`" docs/ENGINE.md`
      returns no match.
    - `grep -n "exec-types" docs/ENGINE.md` returns at least the line 7 and
      line 309 references.
    - `npm run typecheck` still exits 0 and `npm test` still passes (docs-only
      edit; no code impact).
