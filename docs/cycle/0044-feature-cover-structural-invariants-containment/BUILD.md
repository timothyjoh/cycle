## Summary

This cycle closes the regression-guard gap on the two fail-loud containment branches in `scripts/structural-invariants.mjs` (the predicate-throw `catch`/`continue` and the malformed-entry `else`) by exercising them against the real module instead of a `probe.mjs` replica.

**Files modified/created:**
- `scripts/structural-invariants.mjs` (250 lines; +97/−... refactor): the inline driver loop and terminal `process.exit` were extracted into the exported `async function runInvariants(invariants, cwd)` (returns the failure count), the `INVARIANTS` table is now `export const`, and the gate is gated behind an `import.meta.url === pathToFileURL(process.argv[1]).href` main guard. The per-entry read now uses the `cwd` parameter; an unreadable target emits the unchanged `cannot read` line then throws a tagged `Error` (`exitCode = 2`) which the main guard maps back to `process.exit(2)`. All diagnostic strings, the dispatch order, and exit codes 0/1/2 are byte-for-byte unchanged.
- `scripts/structural-invariants.d.mts` (13 lines, new): a `.d.mts` type surface (`Invariant`, `INVARIANTS`, `runInvariants`) so the TypeScript test can import the `.mjs` export under `tsc --noEmit`.
- `tests/scripts/structural-invariants.test.ts` (201 lines): the `probe.mjs` replica block was removed and replaced with two in-process drivers calling the real `runInvariants` export — a throwing-`validate` entry (asserts `failed === 1`, throw contained not propagated, `predicate threw: boom` captured) and a malformed entry with no `pattern`/`validate` (asserts `failed === 1`, `malformed invariant entry` captured). A local `captureConsoleError()` helper overrides `console.error` for the call and restores it in `finally`. The real-repo CLI-preservation pins (`5 paired`, exit 0, clean stderr) and all count-based / residue / hermeticity subprocess tests are retained untouched.
- `CLAUDE.md`: the *Structural-invariants policy* section already notes `runInvariants(invariants, cwd)` as an importable export and the import-safe main-guard contract.

**PLAN tasks complete:** Task 1 (`runInvariants` extraction + `import.meta` main guard) and Task 2 (`probe.mjs` replica replaced with real-export drivers) are both done. All eight SPEC acceptance bullets are satisfied.

**Test suite:** `npm run test:coverage` → 1077 tests, 1077 pass, 0 fail. `npm run check:coverage` and `npm run check:invariants` (both run automatically after `test:coverage`) pass; the real-repo invariants gate emits `5 paired` and all `ok --` lines. `npm run typecheck` (`tsc --noEmit`) is clean — no warnings.

**Coverage:** `scripts/structural-invariants.mjs` is **97.20% ≥ 90%** floor (up from the ~94.81% baseline — no regression). LCOV now reports the containment branches covered: the predicate-throw `catch` body (lines 210–212) and the malformed-entry `else` body (lines 233–237) all show non-zero `DA` hit counts; no line in 203–237 is uncovered. No per-file floor regressed.

**Failure modes handled, with covering tests:** (1) *predicate throws* — contained inside the loop `catch`, records a `FAIL`, increments the count, `continue`s; covered by the throwing-`validate` test asserting the throw never escapes and the count is 1. (2) *malformed entry* — records a `FAIL` with the `malformed invariant entry` diagnostic; covered by the malformed-entry test. (3) *unreadable target* — emits `cannot read` then throws `exitCode = 2`, mapped to CLI exit 2 by the main guard (idempotent, read-only, no swallow-to-pass); the existing subprocess tests retain coverage of the FAIL/exit paths. `console.error` is restored in `finally` so the override cannot leak into other tests.

**Deviations from PLAN:** one addition not enumerated in PLAN — a `scripts/structural-invariants.d.mts` type-declaration file was required so the TypeScript test could statically import the `.mjs` export without a `tsc --noEmit` error; PLAN assumed a bare static import would suffice. This is import surface only, no behavior change.

**Deferred work:** none. The agent-fleet REGISTRY consistency invariant noted in CLAUDE.md remains out of scope for this cycle.

## Touched Files
- scripts/structural-invariants.mjs
- scripts/structural-invariants.d.mts
- tests/scripts/structural-invariants.test.ts
- CLAUDE.md
