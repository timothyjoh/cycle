670/670 passing. All gates green.

## Summary

All four PLAN tasks complete. Coverage: Line 98.55%, Branch 92.48%, Function 93.13% — all above baseline. No regressions.

**Files created or modified:**

- `src/engine/queue.ts` — Added `Priority` type, `PRIORITY_ORDER` map, `normalizePriority` (exported), extended `QueueRow` with `priority: Priority`, updated `isQueueRow` guard, added normalization pre-pass in `readQueue`, rewrote `popNextPending` with priority sort + topological clamp (+35 lines)
- `src/engine/triage.ts` — Imported `normalizePriority`; wired `raw.fm.priority` into todo frontmatter and `QueueRow` in `applyRaw` (+5 lines)
- `src/issue/materialize.ts` — Removed `priority: number` parameter; emits `priority: medium` unconditionally (-4 lines)
- `src/cli/parse-args.ts` — Removed `DropArgs.priority`, removed `--priority` flag parsing and validation block (-18 lines)
- `src/cli.ts` — Removed `args.priority` argument from `materializeFreeformIssue` call (-1 line)
- `scripts/coverage-gate.mjs` — Added `src/engine/queue.ts: 90` floor (+1 line)
- `tests/engine/queue.test.ts` — Added `priority: 'medium'` to `row()` factory; imported `normalizePriority` and `Priority`; added 9 new test groups covering normalization, sort, stability, topological clamp (+103 lines)
- `tests/engine/triage-priority.test.ts` — New file: two triage integration tests (explicit `critical` priority and absent priority defaulting to `medium`) (+103 lines)
- `tests/engine/blocked.test.ts` — Added `priority: 'medium'` to `row()` factory (+1 line)
- `tests/engine/issue-lifecycle.test.ts` — Added `priority: 'medium'` to `queueRow()` factory (+1 line)
- `tests/engine/triage-validator.test.ts` — Added `priority: 'medium'` to three inline `QueueRow` fixtures (+3 lines)
- `tests/scripts/coverage-gate.test.ts` — Added `src/engine/queue.ts` to ALL_PASSING fixture and both below-floor/absolute-path fixtures (+3 lines)
- `tests/issue/materialize.test.ts` — Updated expected frontmatter from `priority: 3` to `priority: medium`; replaced explicit-priority test with 3-arg call test
- `tests/cli/drop-priority.test.ts` — Replaced both tests: default emits `priority: medium`; `--priority` flag causes non-zero exit
- `tests/cli/parse-args.test.ts` — Replaced 11 `--priority` integer tests with 3 updated tests matching new behavior
- `tests/cli/cleanup.test.ts` — Added `priority: 'medium' as const` to inline queue row fixture (+1 line)
- `tests/cli/multi-loop.test.ts` — Updated test name and expected frontmatter from `priority: 3` to `priority: medium`
- `CLAUDE.md` — Added `src/engine/queue.ts (90%)` to per-file floors list
- `docs/RFC-001-issue-lifecycle.md` — Updated priority field description from numeric 1–10 to enum values; updated `cycle drop` default from `3` to `medium`
- `docs/ENGINE.md` — Added priority sort + topological clamp note to Queue section

Test suite: `npm test` — 670 tests, 0 failures. Coverage: `npm run test:coverage && npm run check:coverage` — Line 98.55%, Branch 92.48%, Function 93.13%, all per-file floors met including new `src/engine/queue.ts` at 97.62% ≥ 90%.

## Touched Files
- src/engine/queue.ts
- src/engine/triage.ts
- src/issue/materialize.ts
- src/cli/parse-args.ts
- src/cli.ts
- scripts/coverage-gate.mjs
- tests/engine/queue.test.ts
- tests/engine/triage-priority.test.ts
- tests/engine/blocked.test.ts
- tests/engine/issue-lifecycle.test.ts
- tests/engine/triage-validator.test.ts
- tests/scripts/coverage-gate.test.ts
- tests/issue/materialize.test.ts
- tests/cli/drop-priority.test.ts
- tests/cli/parse-args.test.ts
- tests/cli/cleanup.test.ts
- tests/cli/multi-loop.test.ts
- CLAUDE.md
- docs/RFC-001-issue-lifecycle.md
- docs/ENGINE.md
