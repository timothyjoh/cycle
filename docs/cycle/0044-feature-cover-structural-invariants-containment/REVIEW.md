All verification passes. Writing the review.

# Review: Cycle 0044

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
A clean, well-scoped regression-guard cycle. The inline dispatch loop in `scripts/structural-invariants.mjs` was extracted into an importable `runInvariants(invariants, cwd)` export behind an `import.meta` CLI main guard, the `probe.mjs` replica was deleted, and the real containment branches are now driven in-process. All diagnostic strings, dispatch order, and exit codes are preserved byte-for-byte; CLI behavior is verified unchanged by the retained subprocess pins.

### Findings
1. **Correctness (positive)**: The predicate-throw containment (`catch`/`continue`) and malformed-entry `else` are unchanged and now exercised against the real module — `scripts/structural-invariants.mjs:209-213`, `scripts/structural-invariants.mjs:232-237`.
2. **Fail-safe (positive)**: The unreadable-target path no longer `process.exit(2)`s mid-loop; it emits the unchanged `cannot read` diagnostic, then throws a tagged `Error` (`exitCode = 2`) that the main guard maps back to exit 2 — `scripts/structural-invariants.mjs:196-201`, `scripts/structural-invariants.mjs:247-249`. The error is surfaced (stderr + non-zero exit), not swallowed.
3. **Import-safety (positive)**: The gate fires only when `import.meta.url === pathToFileURL(process.argv[1]).href`, so importing the module from the test does not run the gate or call `process.exit` — `scripts/structural-invariants.mjs:243`.
4. **Architecture (positive)**: `INVARIANTS` and `runInvariants` are now `export`s; the production table remains the single source of truth the CLI passes. The `.d.mts` type surface (`scripts/structural-invariants.d.mts`) lets the TS test import the `.mjs` export under `tsc --noEmit` — a justified, behavior-neutral addition (flagged in BUILD.md as a deviation from PLAN).
5. **Minor (non-blocking)**: LCOV now flags `197-201` (cannot-read catch) and `248-249` (main-guard catch) as the only uncovered lines. These are out-of-SPEC error paths; the file rose to 97.20% (from ~94.81% baseline), so no floor regression and the SPEC-targeted branches are now covered.

### Spec Compliance Checklist
- [x] Test imports a callable export from the real module and asserts a throwing-`validate` entry is contained as a `FAIL` — `tests/scripts/structural-invariants.test.ts:148-166`
- [x] Test asserts a malformed entry (no `pattern`/`validate`) is a `FAIL` — `tests/scripts/structural-invariants.test.ts:168-184`
- [x] `probe.mjs` replica removed (grep for `probe.mjs` returns nothing)
- [x] Failure-path: throwing predicate → non-zero count + `predicate threw:` diagnostic; malformed → non-zero count + `malformed invariant entry` diagnostic — asserted directly
- [x] `node scripts/structural-invariants.mjs` still exits 0, emits `ok --` lines including `5 paired` and clean stderr — verified (real-repo run + retained subprocess pin `tests/scripts/structural-invariants.test.ts:194`)
- [x] LCOV no longer flags the targeted containment lines; floor (90%) met at 97.20%
- [x] `npm run check:coverage` and `npm run check:invariants` pass
- [x] All existing tests still pass (1077 pass / 0 fail)
- [x] No compiler/linter warnings (`tsc --noEmit` clean)
- [x] SPEC.md has a populated `## Acceptance Criteria` section (8 testable bullets)
- [x] PLAN.md `## SPEC Acceptance Traceability` present, re-quotes all 8 AC bullets verbatim with covering tasks — `PLAN.md:223-235`
- [x] CONCRETE USER BENEFIT delivered: weakening the real `try/catch` or malformed-entry `else` now fails a test that drives the shipped code, not a replica

## Adversarial Test Review

### Summary
Strong. The new tests drive the actual module rather than a faithful copy — the entire point of the cycle. Mocking is minimal and necessary (only `console.error`, restored in `finally`); real temp filesystem is used for targets.

### Findings
1. **Mock discipline (positive)**: Only `console.error` is overridden, scoped to the call and restored in a `finally` so it cannot leak into sibling tests — `tests/scripts/structural-invariants.test.ts:138-146`.
2. **Assertion quality (positive)**: Both new tests pin `assert.equal(failed, 1)` plus a specific diagnostic substring (`predicate threw: boom` / `malformed invariant entry`) — not weak truthiness.
3. **Containment proven (positive)**: The throwing-`validate` test confirms the throw never escapes `runInvariants` (the call returns a count rather than rejecting), directly exercising the `catch`/`continue`.
4. **Coverage gap (minor, non-blocking)**: No in-process test for the relational-`!res.ok` FAIL or count-based `pattern` branches via `runInvariants`, and the `cannot read`/exit-2 path is not directly driven through the new export. These remain covered by the retained subprocess fixture tests and are out of this cycle's scope; coverage stays above floor.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function (`scripts/structural-invariants.mjs`): 97.20% / 88.00% / 100.00%
- Regressions vs base (per-file): none — `scripts/structural-invariants.mjs` rose from ~94.81% to 97.20%; all other per-file floors reported `ok`
- New code without tests: none in scope (the two new error catches at `197-201`/`248-249` are out-of-SPEC paths, above floor)
- Specific scenarios missing tests: in-process drive of the relational-FAIL, count-based, and cannot-read paths (out of scope; covered via subprocess)

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| "The dispatch loop is exposed as an importable export — `runInvariants(invariants, cwd)` (returns the failure count) plus `INVARIANTS`" | `CLAUDE.md:57` | `scripts/structural-invariants.mjs:189`, `scripts/structural-invariants.mjs:57` | OK |
| "the module is import-safe: the gate … runs only under the `import.meta` CLI main guard" | `CLAUDE.md:57` | `scripts/structural-invariants.mjs:243` | OK |
| "CLI behavior (`node scripts/structural-invariants.mjs` exit 0/1/2, stdout/stderr text) is unchanged" | `CLAUDE.md:57` | `scripts/structural-invariants.mjs:245-249` | OK |
| "a test can drive the real containment branches in-process (`tests/scripts/structural-invariants.test.ts`) without spawning the script" | `CLAUDE.md:57` | `tests/scripts/structural-invariants.test.ts:7,148-184` | OK |
