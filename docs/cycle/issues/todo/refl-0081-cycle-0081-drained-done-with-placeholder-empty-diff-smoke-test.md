---
id: refl-0081-cycle-0081-drained-done-with-placeholder-empty-diff-smoke-test
title: "Smoke test: assert non-empty diff after build/fix steps that report status:ok"
workflow: feature
depends_on: [refl-0080-cycle-0080-empty-diff-guard-never-implem-apply-fix-md-tasks]
triaged_at: "2026-05-16T00:36:16.807Z"
source: triage
parent: refl-0081-cycle-0081-drained-done-with-placeholder
---
## Context

Cycles 0080 and 0081 both committed with placeholder `BUILD.md`/`FIX.md` content, producing commits with misleading titles and zero meaningful diffs. The empty-diff post-condition guard implementation is tracked in `todo/refl-0080-cycle-0080-empty-diff-guard-never-implem-apply-fix-md-tasks.md`.

Once that guard lands, a regression test should verify that the engine actually rejects a cycle where `build` or `fix` completes with `status:ok` but produces no diff — confirming the guard fires and the misleading-commit pattern cannot silently recur.

## Acceptance Criteria

1. A test in `tests/engine/` (new file or appended to `run-cycle.test.ts`) exercises the case where a `build` or `fix` step agent exits 0 but produces no change to the working tree.
2. The test asserts the engine emits `cycle.end status:failed` (not `status:ok`) in that scenario.
3. The test uses the existing fake-claude stub pattern from `tests/engine/run-cycle.test.ts` — no real subprocess.
4. `npm test` passes with no regression against current coverage baselines (line ≥ 95%, branch ≥ 75%, function ≥ 90%).

## Notes

- The guard implementation is in the `depends_on` item. This issue covers the test pin only.
- Consider a second assertion: if `BUILD.md` or `FIX.md` contains known placeholder sentinel text ("Waiting for permission grants", "Need write permission"), that is treated as a distinct failure signal — useful if the diff-size check ever has edge cases.
