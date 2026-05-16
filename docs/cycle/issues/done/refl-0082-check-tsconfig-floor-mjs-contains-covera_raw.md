---
id: refl-0082-check-tsconfig-floor-mjs-contains-covera
source: reflection
title: check-tsconfig-floor.mjs contains coverage-gate.mjs body — tsconfig check is a no-op
added_at: "2026-05-16T01:07:16.381Z"
triage_attempts: 0
priority_hint: 9
origin_cycle_id: "0082"
---

The file `scripts/check-tsconfig-floor.mjs` was created and committed in cycle 0082, but its content is the LCOV-parsing body of `coverage-gate.mjs` verbatim (shebang comments reference coverage-gate, FLOORS table, LCOV_PATH, `blocks` map, etc.). It performs no tsconfig validation whatsoever. Running `node scripts/check-tsconfig-floor.mjs` against the repo root will attempt to read `.cycle/coverage.lcov`, not `tsconfig.json`, and will exit 2 with a coverage-gate error.

The PLAN.md has the correct implementation ready (Task 1 code block). A fix cycle needs to overwrite the file with the correct 20-line tsconfig-reading script from PLAN.md Task 1. This is the highest-priority blocker because the guard's name suggests protection that does not exist.
