---
id: refl-0082-cycle-0082-tasks-2-4-never-executed-pack
title: cycle 0082 tasks 2-4 never executed — package.json, test suite, RFC-002 all missing
workflow: feature
depends_on: [refl-0082-check-tsconfig-floor-mjs-contains-covera]
triaged_at: "2026-05-16T01:15:15.484Z"
source: triage
---
## Problem

Cycle 0082 produced only partial Task 1 output (and that content was wrong — see `refl-0082-check-tsconfig-floor-mjs-contains-covera`). Tasks 2, 3, and 4 from PLAN.md were never executed: the guard is not wired into any npm lifecycle, there is no test coverage, and RFC-002 still carries an unresolved deferrable-concern annotation.

All three tasks are fully specified in cycle 0082's PLAN.md with exact line edits and code. Execute them verbatim once the script content is correct.

## Missing deliverables

### Task 2 — Wire `package.json` scripts

In `package.json`:
- Add `"check:tsconfig-floor": "node scripts/check-tsconfig-floor.mjs"` to the `scripts` block.
- Prepend `npm run check:tsconfig-floor && ` to the existing `pretest:coverage` script so the floor guard runs automatically before every coverage invocation.

### Task 3 — Add test suite

Create `tests/scripts/check-tsconfig-floor.test.ts` covering the four SPEC cases:
1. Valid `tsconfig.json` with `target: "ES2023"` and `lib: ["ES2023"]` → exits 0
2. `target` below the floor (e.g. `"ES2015"`) → exits 1 with a diagnostic message naming the offending value
3. `lib` contains a sub-floor entry (e.g. `"ES5"`) → exits 1 with a diagnostic message naming the offending entry
4. Missing `tsconfig.json` → exits 1 with a helpful not-found message

### Task 4 — Annotate RFC-002

In `docs/RFC-002-typescript-es2023-floor.md`, annotate the deferrable-concern sentence near line 19 to reference the new `check:tsconfig-floor` npm script and mark the concern resolved.

## Prerequisite

`refl-0082-check-tsconfig-floor-mjs-contains-covera` must land first. The script must contain correct tsconfig validation logic before it can be wired into npm lifecycle hooks or tested.

## Acceptance criteria

- `npm run check:tsconfig-floor` exits 0 on a clean repo with ES2023 tsconfig
- `npm run test:coverage` automatically invokes the floor check via `pretest:coverage`
- `tests/scripts/check-tsconfig-floor.test.ts` exists; all four SPEC cases pass under `npm test`
- RFC-002 deferrable-concern annotation present, referencing `check:tsconfig-floor`
- `npm run typecheck` passes (no warnings)
- Coverage does not regress (line ≥ 95%, branch ≥ 75%, function ≥ 90%)
