---
id: refl-0192-run-cycle-model-thinking-forwarding-path
title: Add run-cycle unit test asserting model/thinking fields are forwarded into runStep
workflow: feature
depends_on: []
triaged_at: "2026-05-20T02:51:38.266Z"
source: triage
---
## Problem

Two layers of codex model/thinking support are already tested in isolation:

- **exec-codex layer**: tests verify that `model` and `thinking` values are translated into correct argv flags.
- **workflow parsing layer**: tests verify YAML round-tripping — that `model` and `thinking` survive deserialization into the `Step` type.

But the junction at `run-cycle.ts:288` — where `step.model` and `step.thinking` are read off the step and forwarded as arguments into `mod.runStep()` — has no dedicated assertion. A refactor that accidentally drops these fields (e.g. passing a spread without those keys, or forgetting to thread them through an intermediate object) would pass all existing tests undetected.

## Acceptance Criteria

- [ ] A new test in `tests/run-cycle.test.ts` (or a new focused test file) spies on the codex exec module's `runStep` function.
- [ ] The test constructs a workflow step with `agent: codex`, `model: o4-mini`, and `thinking: high`.
- [ ] The test asserts that the resulting `runStep` call receives both `model: "o4-mini"` and `thinking: "high"` in the options passed to it.
- [ ] Cardinality is pinned: the spy fires exactly once (use `expectExactlyOne` or `filter(...).length === 1` per test conventions — no bare `find`).
- [ ] All existing tests continue to pass with no regressions.
- [ ] Coverage does not decrease from the current baseline.

## Technical Notes

- **Target**: the `mod.runStep(...)` call in `src/engine/run-cycle.ts` around line 288, where `step.model` and `step.thinking` are forwarded.
- **Spy approach**: import-mock or vi.mock the exec-codex module; capture call arguments; assert shape of the options object received.
- **Scope**: unit test only — no real codex process should be spawned. The test exercises only run-cycle's forwarding logic, not exec-codex's argv building (that layer already has its own tests).
- **Dependency note**: the code under test already exists (landed in cycle 0192). This ticket adds the missing test coverage; no production code changes expected.

## Why This Matters

Without this test, the three-layer chain (YAML → Step type → runStep args → argv flags) has a gap at the middle join. The exec-codex and workflow tests provide false confidence: they each pass even if run-cycle silently drops the fields before calling `runStep`. This test closes that gap and makes the full forwarding path regression-proof.
