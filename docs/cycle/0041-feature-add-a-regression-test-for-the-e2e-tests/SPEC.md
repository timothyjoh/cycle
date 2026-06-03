# SPEC — Cycle 0041: Regression test pinning the e2e-tests research-phase no-op short-circuit

## WHY
CLAUDE.md and `docs/ENGINE.md` assert that the research-phase no-op short-circuit fires for *any* workflow's `research` step — explicitly naming `e2e-tests` — matching the name-keyed `step.name === "research"` gate in `src/engine/run-cycle.ts`, which carries no workflow check. That cross-workflow claim has zero test backing: the entire `tests/engine/noop-resolution.test.ts` suite drives only the `feature` workflow. Cycle 0035's REVIEW.md Finding 5 recorded this as the cycle's sole MUST-FIX gap — documented behavior that no test exercises. Until a test drives a non-`feature` workflow through the research-phase short-circuit, a future change that re-introduces a workflow gate on the no-op detection would pass CI silently and re-open the doc-vs-code drift.

## CONCRETE USER BENEFIT
A cycle operator running the `e2e-tests` workflow (or any non-`feature` workflow) can rely on the documented guarantee that an already-satisfied issue resolves to `noop` at the research phase — before `plan`/`build`/`review` burn agent turns — because the suite now fails loudly if a code change quietly re-couples that detection to the `feature` workflow. The behavior the docs promise is now machine-verified across workflows, not just asserted in prose.

## USABLE END-STATE
`npm test` includes a passing test that drives the `e2e-tests` workflow through a `research` step which exits 0 and writes a valid `NOOP.md`, and asserts the cycle short-circuits to `cycle.noop { detected_at_step: "research" }` → `cycle.end { status: "noop" }` with `plan`/`build`/`review` never running. A regression that re-introduces a `feature`-only gate on research-phase no-op detection turns this test red.

## SCAFFOLDING ESCAPE HATCH
Not applicable — this round delivers a directly observable guarantee (a green/red signal protecting documented cross-workflow behavior) without deferred benefit.

## Objective
This cycle adds a single regression test to `tests/engine/noop-resolution.test.ts` that exercises the research-phase no-op short-circuit through the `e2e-tests` workflow rather than `feature`, locking in the documented, name-keyed `step.name === "research"` behavior that currently has no test coverage. It converts a prose-only guarantee in CLAUDE.md / `docs/ENGINE.md` into an executable assertion, closing the doc-vs-code drift gap flagged as cycle 0035's only MUST-FIX.

## Source Issue
`refl-0035-e2e-tests-research-phase-no-op-is-docume` — "Add a regression test for the e2e-tests research-phase no-op short-circuit"

## Scope

### In Scope
- Add one regression test to `tests/engine/noop-resolution.test.ts` that drives an `e2e-tests` workflow whose `research` step exits 0 and writes a valid `NOOP.md`, asserting the cycle short-circuits to `noop` at the research phase before `plan`/`build`/`review` run.
- Extend the test file's existing repo/workflow scaffolding only as needed to express a multi-step `e2e-tests` workflow (the current `workflowYml` helper builds a single-step `feature` workflow), without regressing the existing `feature`-driven tests.

### Out of Scope
- Any change to engine source (`src/engine/run-cycle.ts`, `src/engine/noop-marker.ts`, `src/cli.ts`) — this is a test-only cycle; the behavior under test already ships.
- Coverage for the build-phase (LATE) no-op fallback or the `noopDrain` issue-lifecycle path — already covered by existing tests.
- Any change to CLAUDE.md / `docs/ENGINE.md` prose (the docs are already correct; this cycle backs them with a test).

## Requirements
- The new test MUST drive the `e2e-tests` workflow (a workflow whose name is not `feature`), so it genuinely exercises the workflow-agnostic, name-keyed `step.name === "research"` gate rather than re-testing the `feature` path.
- The fake agent MUST write a **valid** `NOOP.md` marker: a recognized `reason:` category (`already-satisfied | duplicate | not-actionable`) plus at least one `file.ext:line` evidence line, alongside a non-empty `RESEARCH.md` so the completion-proof check passes.
- The research step MUST exit 0; the test MUST NOT rely on any empty-diff precondition (the research-phase path has none).
- The test MUST assert event ordering: `cycle.noop` precedes `cycle.end { status: "noop" }`, and `runCycle` returns `{ status: "noop", reason, detectedAtStep: "research" }`.
- The test MUST assert the early short-circuit: no `step.start` (or equivalent execution evidence) fires for `test_plan` / `test_build` / `review` after the research no-op resolves.
- Existing tests in the suite (the `feature`-driven cases) MUST continue to pass unchanged; any helper edits must preserve their behavior.
- Per-file coverage for `src/engine/run-cycle.ts` MUST NOT drop below its existing floor (90%); overall coverage must not decrease vs the master baseline.
- **Failure behavior**: This deliverable is a test; its failure surface is the assertion itself. The test MUST be a fail-loud guard — if the engine ever resolves the `e2e-tests` research no-op to anything other than `noop` (e.g. continues into `test_plan`, or a re-introduced `feature`-only gate causes the marker to be ignored), the assertions MUST fail with a clear message rather than passing vacuously. The test MUST NOT swallow `runCycle` errors or assert only existence (`find(...) !== undefined`) for the exactly-once `cycle.noop` event — it MUST cardinality-pin with `filter(...).length === 1` so a double-emission or missing-emission regression is caught.

## Acceptance Criteria
- [ ] `tests/engine/noop-resolution.test.ts` contains a new test that constructs an `e2e-tests` workflow (steps include `research` followed by at least `test_plan`/`test_build`/`review`) and runs it through `runCycle`.
- [ ] **User-observable benefit**: running `npm test` exercises and passes a case proving the research-phase no-op short-circuit works for a non-`feature` workflow — the documented cross-workflow guarantee is now verified by the suite, not only by prose.
- [ ] The test asserts `events.filter(e => e.event === "cycle.noop").length === 1` and that the matched event has `detected_at_step: "research"`.
- [ ] The test asserts a `cycle.end` event with `status: "noop"` fires, and that the `cycle.noop` event precedes it in emission order.
- [ ] The test asserts that no execution event for `test_plan`, `test_build`, or `review` is emitted (the cycle short-circuits before those steps run).
- [ ] The fake agent's `NOOP.md` uses a recognized `reason:` category plus ≥1 `file.ext:line` evidence line, and the test does not establish any empty-diff condition before the research step.
- [ ] **Failure-path criterion**: if the engine is mutated so research-phase no-op detection is gated to `feature` only (so the `e2e-tests` marker is ignored and the cycle proceeds past `research`), this test fails — verified by the assertions above being sensitive to a `test_plan`/`test_build`/`review` step running and to `cycle.noop` not firing exactly once.
- [ ] All existing tests still pass (`npm test`).
- [ ] `npm run check:coverage` passes; `src/engine/run-cycle.ts` stays at or above its 90% floor and overall coverage does not decrease.
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- Framework: `node:test` with `node:assert/strict`, matching the existing `tests/engine/noop-resolution.test.ts` conventions (real temp git repos, a fake `claude` binary on a temp PATH/`CYCLE_CLAUDE_BIN`, direct `runCycle` invocation).
- Reuse and extend the file's existing helpers (`setupRepo`, `workflowYml`, fake-agent shell body that locates the artifact dir via `$CYCLE_ID` and writes `NOOP.md` + `RESEARCH.md`). Generalize `workflowYml` (or add a sibling builder) to emit a multi-step `e2e-tests` workflow without breaking the current single-step `feature` callers.
- Key scenarios to cover:
  - **Happy path**: `e2e-tests` `research` exits 0 + valid `NOOP.md` ⇒ `cycle.noop { detected_at_step: "research" }` → `cycle.end { status: "noop" }`, `runCycle` returns `status: "noop"`.
  - **Short-circuit regression guard**: assert `test_plan`/`test_build`/`review` never execute (cardinality/absence assertions on their step events).
  - **Exactly-once**: cardinality-pin `cycle.noop` with `filter(...).length === 1` per the test-conventions rule.
- No UI changes; no Playwright/E2E browser tests required.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No change required — CLAUDE.md and `docs/ENGINE.md` already document the cross-workflow research-phase short-circuit. This cycle backs the existing claim with a test. If the build/fix completes and the wording warrants a one-line note that the cross-workflow path is now test-covered, add it; otherwise no doc edit is needed.
- **README.md**: No user-facing surface changes.

This is a test-only change to an internal engine guarantee; the relevant "documentation" is the executable assertion itself plus the already-accurate engine notes. No new user-facing docs are introduced.

## Dependencies
- `tests/engine/noop-resolution.test.ts` and its existing fake-agent / temp-repo scaffolding (already in the repo).
- The shipped research-phase no-op machinery: `src/engine/run-cycle.ts` (`step.name === "research"` gate), `src/engine/noop-marker.ts` (`classifyNoopMarker`), and the `cycle.noop` / `cycle.end { status: "noop" }` events.
- `git`, Node ≥ 22.6, and the existing test toolchain (`npm test`, `npm run test:coverage`, `npm run typecheck`). No external services or env vars beyond the test harness's `CYCLE_CLAUDE_BIN` fake-agent override.
