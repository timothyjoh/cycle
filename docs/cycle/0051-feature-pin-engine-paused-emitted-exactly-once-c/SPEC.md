Emitting SPEC to stdout.

```markdown
# SPEC — Cycle 0051: Pin engine.paused Emitted-Exactly-Once Cardinality in Triage Whole-Pass-Failure Test

## Objective

Lock the SPEC §Functional invariant that `engine.paused` emits **exactly once** per whole-pass triage failure at the test layer. The current whole-pass-failure test in `tests/engine/triage.test.ts` retrieves the event with `events.find(...)`, which returns only the first match — a future regression that emits the event twice would silently pass. Add a one-line cardinality assertion so refactors of the emission site can't drift this load-bearing property unnoticed.

## Source Issue

`refl-0022-engine-paused-exactly-once-assertion-mis` — "Pin engine.paused emitted-exactly-once cardinality in triage whole-pass-failure test"

## Scope

### In Scope

- Add a single `assert.equal(events.filter(e => e.event === "engine.paused").length, 1)` assertion to the existing whole-pass-failure test in `tests/engine/triage.test.ts` (the test starting at line 487, `"whole-pass failure: only raw fails all attempts → engine.paused"`), placed alongside the existing `events.find(...)` lookup at line 503.

### Out of Scope

- Refactoring the emission site in `src/engine/triage.ts` or hoisting it behind a helper.
- Adding cardinality assertions to the multi-raw whole-pass-failure test (line 531) or the unknown-agent test (line 799) — issue scopes only the single canonical whole-pass-failure test.
- Pinning cardinality of other engine events (`engine.halted`, `engine.stop`, `reflection.summary`).
- Property-style tests across multiple failure paths.
- New fixtures, new test cases, or any production-code changes.

## Requirements

- The new assertion uses `events.filter(...).length === 1`, not `find` + sibling-bound checks, so the cardinality property is asserted directly.
- The assertion sits in the same test body as the existing payload-shape assertions so a regression in cardinality fails the same test that owns the payload contract.
- No `tests/engine/triage.test.ts` line-number drift beyond the single inserted assertion line.
- The assertion message (if any) names "exactly once" so failure output makes the invariant self-explanatory.

## Acceptance Criteria

- [ ] `tests/engine/triage.test.ts`, inside `test("whole-pass failure: only raw fails all attempts → engine.paused", …)`, contains an assertion of the form `assert.equal(events.filter(e => e.event === "engine.paused").length, 1, …)`.
- [ ] `npm test` passes (all existing tests still green, new assertion green against current single-emission code).
- [ ] `npm run typecheck` clean — no new warnings.
- [ ] `npm run test:coverage` shows no per-file regression below the configured floor (`src/engine/triage.ts ≥ 95%` enforced by `scripts/coverage-gate.mjs`); aggregate line / branch / function metrics non-decreasing vs the cycle-0050 baseline.
- [ ] A mutation that emits `engine.paused` twice in the whole-pass-failure path would fail this test (validated by reasoning, not by committing the mutation).

## Testing Strategy

- Test framework: Node's native test runner (`node --test`) via `npm test`, already in use across the suite.
- The change is a single assertion inside an existing test; no new test file, no new fixture, no new mocking.
- Scenarios covered by the inserted assertion:
  - Happy path (single emission): assertion passes — verified by running `npm test` after the edit.
  - Regression guard (hypothetical double emission): would fail the new assertion before the existing `find`-based payload checks, surfacing the cardinality violation with a clear length mismatch.
- No E2E coverage required — this is a unit-level invariant on engine-internal events.

## Documentation Updates

- **CLAUDE.md / AGENTS.md**: No change. The cardinality invariant is already documented in the source-issue scope and the underlying SPEC §Functional language; the test-layer pin doesn't introduce new conventions or commands.
- **README.md**: No change. No user-facing behavior shifts.

Documentation is part of "done" — code without updated docs is incomplete. For this cycle the rule is satisfied vacuously: a single test assertion that locks an existing behavioral invariant introduces no new commands, conventions, or user-facing surface area to document.

## Dependencies

- Existing test infrastructure in `tests/engine/triage.test.ts` (the `setupRepo`, `makeLog`, `makeConfig`, `rawBody`, `runTriage`, `TriageDeps` helpers are already in scope at the target line).
- No new packages, no env vars, no external services.
```
