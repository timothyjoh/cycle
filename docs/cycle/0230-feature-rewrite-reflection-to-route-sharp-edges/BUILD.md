Line: 435/436 = 99.77%, Branch: 103/111 = 92.79%, Function: 13/13 = 100%.

All quality gates pass. Here is the build summary:

## Summary

Implemented cycle 0230: three-bucket reflection routing. Rewrote `src/engine/reflection.ts` (248 → 320 lines) — replaced `SharpEdge.priority_hint: number` with `bucket: "fix_now" | "defer" | "discuss"` + optional `priority` enum, added `artifactDir`/`touchedJsonPath` params to `ingestReflection` (5-param → 7-param), implemented `readScopeWarnings`, `buildDedupeMap`, `buildFinalFixesContent`, `buildReflectionContent` helpers, and the cap/dedup routing loop; `writeParseError` now emits `priority: "high"` instead of `priority_hint: 7`. Updated `src/engine/run-cycle.ts` (3 lines) to pass `artifactDir` and `join(artifactDir, "touched.json")` to the updated call site. Added `"src/engine/reflection.ts": 95` floor to `scripts/coverage-gate.mjs`. Rewrote `tests/engine/reflection.test.ts` — all 30 existing tests updated (new signature, `bucket`/`priority` inputs, `IngestResult.fixNow`, `reflection.deferred_issue_written` events, updated `setupRepo`), plus 15 new tests covering fix_now routing, FINAL_FIXES.md presence/absence, cap enforcement, discuss-counts-toward-cap, raw/ cleanup behavior, dedup against todo/ and discuss/, scope_warning integration, scope_warning cap, REFLECTION.md presence/absence, priority enum in frontmatter, and no-priority_hint assertion. Updated `tests/engine/run-cycle.reflection.test.ts` to use new JSON schema and event names. Updated `tests/scripts/coverage-gate.test.ts` to add `reflection.ts` to all three LCOV fixtures. Rewrote `src/defaults/prompts/reflection.md` with bucket/priority schema and bright-line routing table; synced to `.cycle/prompts/reflection.md` via `npm run sync-defaults --force`. Updated `docs/ENGINE.md` reflection section to document three-bucket routing, cap/dedup behavior, new log events, and output files; removed stale `priority_hint` references. All tasks complete: Tasks 1–7.

`npm test`: 694 tests, 0 failures. `npm run test:coverage && npm run check:coverage`: line 99.77% ≥ 95% floor, branch 92.79%, function 100%; all per-file floors pass. `npm run check:invariants`: all 4 invariants pass. `npm run typecheck`: no errors.

## Touched Files
- src/engine/reflection.ts
- src/engine/run-cycle.ts
- scripts/coverage-gate.mjs
- src/defaults/prompts/reflection.md
- .cycle/prompts/reflection.md
- tests/engine/reflection.test.ts
- tests/engine/run-cycle.reflection.test.ts
- tests/scripts/coverage-gate.test.ts
- docs/ENGINE.md
