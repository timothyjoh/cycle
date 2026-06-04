## Summary

This cycle repairs the single standing `TS2339` typecheck error at `tests/cli/iteration-too-fast.test.ts:152`. The offending line accessed `.length` on `halts[0].failed_cycles`, which was typed `unknown` (because `readEvents` returns `Array<Record<string, unknown>>` and the `filter` at lines 147–149 is not a type guard), so `tsc --noEmit` rejected the member access under `strict`. Following PLAN.md Task 1, I narrowed the indexed event at the read site with an honest inline cast to an array-bearing shape — `(halts[0] as { failed_cycles?: unknown[] }).failed_cycles?.length` — wrapped in the file's existing multi-line `assert.deepEqual` style. The element type stays `unknown` (no blanket `as any`), the `?.` optional chain is retained verbatim, and the expected value (`1`) and message (`"one failed cycle recorded"`) are unchanged, so the assertion still verifies "exactly one failed cycle recorded" with identical semantics.

**Files modified:** `tests/cli/iteration-too-fast.test.ts` — one assertion reformatted from a single line to a 5-line multi-line `assert.deepEqual` (net +4 lines). No source, gate-script, or fixture changes.

**PLAN.md tasks complete:** Task 1 (narrow the parsed `engine.halted` event at the failing read site) — done; all six of its success criteria met.

**Test suite:** Ran `npm test` → `tests 1108`, `pass 1108`, `fail 0` (exit 0), including the `iteration-too-fast` suite. Ran `npm run typecheck` (`tsc --noEmit`) → exit 0, zero diagnostics, no `TS2339`.

**Coverage:** Ran `npm run test:coverage` (which auto-runs `check:coverage` + `check:invariants`) → exit 0; all per-file floors satisfied and all structural invariants pass. The change is confined to one test file and touches no production source (`git diff --name-only` over `src`/`scripts`/`tests` lists only `tests/cli/iteration-too-fast.test.ts`), so no line/branch/function coverage of source can regress vs the base branch.

**Failure modes handled:** This is a compile-time-only typing change with no new runtime surface. The relevant failure mode is the static gate itself: the honest narrowing to `{ failed_cycles?: unknown[] }` (not `as any`) cannot mask a genuinely wrong shape, and the preserved `?.` optional chain ensures a runtime-absent `failed_cycles` collapses to `undefined` so `assert.deepEqual(undefined, 1, …)` fails loudly rather than throwing a `TypeError` or silently passing. No error is swallowed. Failure-path verification is by inspection (the optional chain is intact at the edited site), consistent with the SPEC, which calls for no new tests.

**Deviations from PLAN.md:** None.

**Deferred / follow-up:** None. `refl-0246` (a distinct TS2345 error in `src/**`) is explicitly out of scope and was not touched.

## Touched Files
- tests/cli/iteration-too-fast.test.ts
