---
id: refl-0049-coverage-gate-mjs-has-no-unit-tests-lcov
title: Add unit tests for scripts/coverage-gate.mjs (LCOV parser + FLOORS + exit codes)
workflow: feature
depends_on: []
triaged_at: "2026-05-14T17:58:49.944Z"
source: triage
---
## Problem

`scripts/coverage-gate.mjs` is a load-bearing build/fix gate (67 lines: LCOV `SF:`/`LF:`/`LH:` walk, `path.relative` normalization for absolute paths, `FLOORS = { "src/engine/triage.ts": 95 }`, exit-code semantics 0/1/2). It is exercised only end-to-end via `posttest:coverage` against real Node coverage output. REVIEW.md for cycle 0049 explicitly deferred a self-test as YAGNI for a 30-line script — but the script grew to 67 lines and the absolute-path normalization branch (`coverage-gate.mjs:35`) is currently dead under Node 22's relative POSIX `SF:` emission, so it has zero exercise.

Why it matters: when the `FLOORS` table grows (per CLAUDE.md the table is the single source of truth for per-file floors) or Node's LCOV emitter format wiggles (absolute vs relative `SF:`, CRLF, BOM, comments), a real regression can flip the gate from "fail loud" to "silently pass". An unobserved gate has no teeth.

## Acceptance

Add `tests/scripts/coverage-gate.test.ts` (preferred; matches existing TS test convention under `tests/`) with at least these fixture-string cases:

1. **Passing path** — LCOV with `src/engine/triage.ts` at ≥95% line coverage → exit `0`, no stderr.
2. **Failing path** — LCOV with `src/engine/triage.ts` at <95% line coverage → exit `1`, stderr names the file and the actual-vs-floor numbers.
3. **Configured path missing from LCOV** — LCOV lacks any `SF:` block for `src/engine/triage.ts` → exit `2`, stderr explains the missing block.
4. **Absent LCOV file** — `.cycle/coverage.lcov` does not exist → exit `2`, stderr explains missing file.
5. **Absolute `SF:` line normalized** — LCOV emits `SF:/abs/path/to/repo/src/engine/triage.ts`; after `path.relative(cwd, …)` it matches the `FLOORS` key → exit `0` on a passing fixture, proving the normalization branch is live.

## Implementation notes

- Run the script as a child process via `spawnSync(process.execPath, ["scripts/coverage-gate.mjs"], { cwd: tmpDir, … })` with each fixture written to `<tmpDir>/.cycle/coverage.lcov`. This keeps the script's CLI contract intact and exercises the real entry point, not a refactor-leaked function.
- Alternative: refactor the parser into a named exported function (e.g. `parseLcov`, `evaluateFloors`) and import it directly. Either approach is acceptable — prefer the child-process route because it also covers the `path.relative(cwd, …)` branch end-to-end.
- Fixture LCOV strings should be minimal and inline in the test file. No need for `tests/fixtures/lcov/*.lcov` files for 5 cases.
- Coverage of `scripts/**` is currently excluded by the `c8`/`--experimental-test-coverage` config; landing tests here will not contribute to coverage numbers unless paired with [[refl-0048-sync-defaults-guard-logic-sits-in-covera]] (which drops the `scripts/**` exclusion). Don't couple the two — file this independently; the value of these tests is regression coverage of the gate's logic, not the coverage report number.

## Out of scope

- Coverage instrumentation of `scripts/**` itself (separate raw: [[refl-0048-sync-defaults-guard-logic-sits-in-covera]]).
- Growing the `FLOORS` table — the script's single source of truth for per-file floors is intentional per CLAUDE.md.
