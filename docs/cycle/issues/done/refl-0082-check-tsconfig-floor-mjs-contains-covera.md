---
id: refl-0082-check-tsconfig-floor-mjs-contains-covera
title: "Fix check-tsconfig-floor.mjs: replace coverage-gate body with correct tsconfig validation logic"
workflow: quickfix
depends_on: []
triaged_at: "2026-05-16T01:10:29.095Z"
source: triage
---
## Problem

`scripts/check-tsconfig-floor.mjs` was created and committed in cycle 0082, but its body is a verbatim copy of `scripts/coverage-gate.mjs`. The file reads `.cycle/coverage.lcov` (not `tsconfig.json`), references `FLOORS`, `LCOV_PATH`, and `blocks`, and exits 2 with a coverage-gate error. The guard name advertises tsconfig ES2023 floor enforcement that does not exist. `npm run check:tsconfig-floor` silently validates nothing about the TypeScript configuration.

## Fix

Overwrite `scripts/check-tsconfig-floor.mjs` with the correct implementation from cycle 0082 PLAN.md Task 1. The script must:

1. Accept an optional repo-root path argument; default to `process.cwd()`.
2. Read `<root>/tsconfig.json` — exit 2 with a clear message if missing or unreadable.
3. Parse the JSON and extract `compilerOptions.target` and `compilerOptions.lib`.
4. Assert `target` equals `"ES2023"` (case-insensitive) — exit 1 with a descriptive error if not.
5. Assert `lib` is an array containing an entry equal to `"ES2023"` (case-insensitive) — exit 1 if not.
6. Print a passing confirmation line and exit 0.

The shebang comment at the top must reference `check-tsconfig-floor.mjs`, not `coverage-gate.mjs`.

## Reference implementation

See `docs/cycle/0082-feature-implement-tsconfig-floor-guard-check-tsc/PLAN.md` Task 1 for the exact ~20-line code block.

## Acceptance criteria

- `node scripts/check-tsconfig-floor.mjs` exits 0 against the repo as-is (tsconfig.json already has `target: ES2023`, `lib: ["ES2023"]`).
- Temporarily mutate `target` to `"ES5"` in tsconfig.json, run the script, confirm exit 1, revert.
- Temporarily remove the `"ES2023"` entry from `lib`, run the script, confirm exit 1, revert.
- `npm run check:tsconfig-floor` (already wired in package.json by cycle 0082) exits 0 cleanly.
- `npm test` passes with no regressions.
- The existing tests in `tests/scripts/check-tsconfig-floor.test.ts` (created by cycle 0082) all pass against the corrected script.
