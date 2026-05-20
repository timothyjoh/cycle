## Tasks

- T1: Add `scopeGuardViolations Map<string, number>` to `src/cli.ts` module scope
- T2: Wire scope_violation check + counter + engine.paused emission into drain loop and resume path
- T3: Add per-file coverage floors and write tests in `tests/cli/scope-guard-halt.test.ts`
- T4: Add ENGINE.md documentation under halt policy section

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet | Covering Task |
|---|---|
| Engine tracks commit-scope-guard rejection count per `cycle_id` | T1, T2 |
| On 2nd consecutive rejection for same `cycle_id`, emit `engine.paused` with `reason: "commit-scope-guard-loop"` and `violations` payload; halt the drain loop | T2 |
| First rejection still allows one retry (threshold is ≥ 2, not ≥ 1) | T2 |
| Successful commit resets the per-cycle counter (delete map entry) | T2 |
| Unit test: two consecutive scope-guard rejections on same `cycle_id` → `engine.paused` emitted exactly once (use `expectExactlyOne` from `tests/helpers.ts`) | T3 |
| Unit test: one rejection followed by successful commit → no `engine.paused` emitted | T3 |
| All existing tests still pass | T3 |
| No compiler/linter warnings introduced | T2, T3 |
