---
id: refl-0049-coverage-gate-mjs-has-no-unit-tests-lcov
source: reflection
title: coverage-gate-mjs-has-no-unit-tests-lcov-parser-untested
added_at: "2026-05-14T17:57:44.963Z"
triage_attempts: 0
priority_hint: 4
origin_cycle_id: "0049"
---

`scripts/coverage-gate.mjs` is now a load-bearing build/fix gate (67 lines: LCOV `SF:`/`LF:`/`LH:` walk, `path.relative` normalization for absolute paths, `FLOORS = { "src/engine/triage.ts": 95 }`, exit-code semantics 0/1/2). It is exercised only end-to-end via `posttest:coverage`, which runs after `test:coverage` against real LCOV output. PLAN/REVIEW (REVIEW.md finding 3) explicitly deferred a self-test as YAGNI for a 30-line script — but the script grew to 67 lines and the normalization branch (REVIEW finding 1, `coverage-gate.mjs:35`) is currently dead via Node 22's relative POSIX `SF:` output, so it has zero exercise.

Why it matters: when the `FLOORS` table grows (per CLAUDE.md the table is the single source of truth) or when Node's LCOV emitter format wiggles (absolute vs relative `SF:`, CRLF, BOM, comments), a real regression can flip the gate from "fail loud" to "silently pass". The gate's whole job is to be paranoid; an unobserved gate has no teeth.

Suggested direction: add `tests/scripts/coverage-gate.test.ts` (or `tests/scripts/coverage-gate.test.mjs`) with fixture-string cases: (1) one passing path, (2) one failing path, asserting exit 1 + stderr text; (3) configured path missing from LCOV → exit 2; (4) absent LCOV file → exit 2; (5) absolute `SF:` line normalized via `path.relative(cwd, …)` matches the FLOORS key. Run as a child-process via `spawnSync(process.execPath, ["scripts/coverage-gate.mjs"], { env: { CWD_OVERRIDE: tmp, … } })` or refactor the parser into an exported function the test imports.
