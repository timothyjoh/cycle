Emitting PLAN to stdout.

```markdown
# Implementation Plan: Cycle 0051

## Overview
Add a single one-line `events.filter(...).length === 1` cardinality assertion to the existing whole-pass-failure test in `tests/engine/triage.test.ts` (the test starting at line 487) so a future regression that emits `engine.paused` twice on the whole-pass triage failure path is caught at the test layer. Pure test-layer pin — no production code, no new test, no new fixture.

## Current State (from Research)
- Target test lives at `tests/engine/triage.test.ts:487-529`, named `"whole-pass failure: only raw fails all attempts → engine.paused"`. It captures every emitted event into `events: Captured[]` via `makeLog()` (declared at lines 37-47).
- Existing payload-shape assertions cluster at lines 503-516, starting with `const paused = events.find((e) => e.event === "engine.paused")` (line 503) followed by `assert.ok(paused, "engine.paused must fire on whole-pass failure")` (line 504), then `reason` / `raw_ids` / `last_errors[]` / absence-of-`failed` checks.
- The sibling negative-form pattern at lines 480-481 uses `events.find(...)` + `assert.equal(paused, undefined, ...)`. SPEC explicitly mandates the new assertion use the `events.filter(...).length` form so the cardinality property is asserted directly rather than via "first match exists".
- Assertion style: `import { strict as assert } from "node:assert"` (already at line 2); `assert.equal(actual, expected, message?)` is the dominant idiom in the file.
- Emission site (`src/engine/triage.ts:229-244`) is structurally single-emission today (post-loop `log.emit("engine.paused", ...)` followed immediately by `return`); the new assertion guards against future refactors that move the emit into the per-raw loop or otherwise duplicate it.
- Coverage: the change adds no executable branches under `src/`, so the `src/engine/triage.ts ≥ 95%` per-file floor and aggregate baselines are structurally non-regressing.

## Desired End State
- The test body at `tests/engine/triage.test.ts:487` contains one new `assert.equal(events.filter((e) => e.event === "engine.paused").length, 1, "engine.paused must fire exactly once per whole-pass failure")` line, placed immediately after `assert.ok(paused, ...)` on line 504 and before the `reason` payload check on line 505.
- `npm test` is green (368/368 → 368/368 with the new assertion satisfied by current single-emission code).
- `npm run typecheck` is clean.
- `npm run test:coverage` → `posttest:coverage` (`scripts/coverage-gate.mjs`) is green; aggregate line / branch / function metrics non-decreasing vs the cycle-0050 baseline (line 99.05% / branch 92.78% / function 96.30% with `triage.ts` line 99.72%).
- A hypothetical mutation that duplicated the emit (`log.emit("engine.paused", payload); log.emit("engine.paused", payload);`) would fail the new assertion with `expected 1, got 2` before the existing payload-shape assertions run.

## What We're NOT Doing
- **No production-code edits.** `src/engine/triage.ts` is not touched in this cycle. The emit site stays structurally single-emission; the test-layer pin guards against future drift, not present behavior.
- **No new tests, fixtures, or helpers.** The single assertion lives inside the existing `whole-pass failure: only raw fails all attempts → engine.paused` test body.
- **No cardinality assertion on the multi-raw whole-pass-failure test** at `tests/engine/triage.test.ts:531`, the unknown-agent test at line 799, or any other test — scope is the single canonical whole-pass-failure test per SPEC.
- **No cardinality assertions for other engine events** (`engine.halted`, `engine.stop`, `reflection.summary`).
- **No refactor of the emit site** behind a helper or shared logger wrapper.
- **No property-style cross-path tests.**
- **No documentation updates** (CLAUDE.md / AGENTS.md / README.md). The cardinality invariant is already documented in the source-issue scope and SPEC §Functional; the test-layer pin introduces no new commands, conventions, or surface area. Documentation-is-part-of-done is satisfied vacuously here.

## Implementation Approach
One vertical slice. TDD-style with a reasoning-validated red phase (we don't commit a mutation to the emit site — SPEC §Acceptance Criteria explicitly says "validated by reasoning, not by committing the mutation"). The slice is: pick the message wording and placement (decided below), insert the assertion, run the full quality gate (`npm test` + `npm run typecheck` + `npm run test:coverage`), confirm coverage non-regression, commit.

**Decisions made at plan time (resolves the two open questions from RESEARCH.md):**

1. **Assertion message string** — `"engine.paused must fire exactly once per whole-pass failure"`. Names "exactly once" (per SPEC requirement) and mirrors the existing sibling message `"engine.paused must fire on whole-pass failure"` (line 504) for visual symmetry in failure output.
2. **Placement** — immediately after `assert.ok(paused, ...)` at line 504 and before the `reason` payload check at line 505. Rationale: `assert.ok` verifies existence (most fundamental — if no event fires at all, that message is clearest); the cardinality check runs next so a `count !== 1` regression fails before payload-shape assertions run on a potentially-wrong event; payload checks follow as today. This satisfies the SPEC's "alongside the existing `events.find(...)` lookup at line 503" requirement (the new line sits inside the same 503-516 lookup-and-check cluster).

---

## Task 1: Insert exactly-once cardinality assertion

### Overview
Add a single `assert.equal(events.filter(...).length, 1, ...)` line to the existing whole-pass-failure test, then run the full quality gate.

### Changes Required

**File**: `tests/engine/triage.test.ts`

**Change**: Insert one new assertion line between current line 504 and current line 505. The before/after diff:

Before (lines 503-505):
```ts
    const paused = events.find((e) => e.event === "engine.paused");
    assert.ok(paused, "engine.paused must fire on whole-pass failure");
    assert.equal(paused?.fields.reason, "all_triage_failed");
```

After (lines 503-510):
```ts
    const paused = events.find((e) => e.event === "engine.paused");
    assert.ok(paused, "engine.paused must fire on whole-pass failure");
    assert.equal(
      events.filter((e) => e.event === "engine.paused").length,
      1,
      "engine.paused must fire exactly once per whole-pass failure",
    );
    assert.equal(paused?.fields.reason, "all_triage_failed");
```

Net diff: +5 lines, -0 lines (the assertion is split across 5 lines for the same wrap style the file uses elsewhere — see lines 507-510's `lastErrors` cast for the same multi-line shape). Single-line form `assert.equal(events.filter((e) => e.event === "engine.paused").length, 1, "engine.paused must fire exactly once per whole-pass failure");` is also acceptable if Prettier/`tsc` doesn't enforce a wrap; the multi-line form above matches existing style in this file and is safer against future line-length lint.

### Success Criteria
- [ ] The new assertion line is present in `tests/engine/triage.test.ts` inside `test("whole-pass failure: only raw fails all attempts → engine.paused", …)`, between the existing `assert.ok(paused, ...)` line and the existing `reason` check.
- [ ] `npm test` exits 0; the test count is unchanged vs cycle 0050 baseline (or the count the suite reports on master HEAD at plan-execution time) and every test is green.
- [ ] `npm run typecheck` exits 0 with zero warnings.
- [ ] `npm run test:coverage` exits 0; `posttest:coverage` (i.e. `scripts/coverage-gate.mjs`) confirms `src/engine/triage.ts` line coverage stays at or above the configured floor (≥ 95%) and aggregate line / branch / function metrics are non-decreasing vs the cycle-0050 baseline (line ≥ 99.05%, branch ≥ 92.78%, function ≥ 96.30% — or whatever the suite reports on master HEAD at plan-execution time, treated as the new floor).
- [ ] Reasoning check (no committed mutation): if `src/engine/triage.ts:229-244` were mutated to emit `engine.paused` a second time before the `return`, the new assertion's `expected 1, got 2` failure would precede the existing payload-shape failures in the test output. (Verified by inspection of the assertion shape — no need to commit the mutation.)

---

## Testing Strategy

### Unit Tests
- **No new test cases.** The change is a single assertion inside an existing test (`tests/engine/triage.test.ts:487`).
- **Edge cases already covered by the surrounding test:**
  - Single-raw whole-pass failure (the test's setup): `runAgent` returns `not json` every call; all three per-raw retry attempts hit the parse-error path; the engine emits `engine.paused` once with `raw_ids: ["only"]` and `last_errors[0].raw_id === "only"`.
  - The new assertion adds the cardinality dimension to that same scenario.
- **Mocking strategy:** Reuse the existing `makeLog()` (lines 37-47, returns `{ log, events }`) and `TriageDeps.runAgent` injection — both real, in-test, no global mocks. SPEC §Anti-Mock is satisfied: no new mocks, no patching, no module-level stubs.

### Integration / E2E Tests
- None. The cardinality invariant is unit-level on engine-internal events (per SPEC §Testing Strategy). No `cycle status` / CLI surface change. No `.cycle/log.jsonl` shape change.

## Risk Assessment

- **Risk: line-number drift in other tools / docs that reference `tests/engine/triage.test.ts` lines.** Mitigation: SPEC requires "no line-number drift beyond the single inserted assertion line"; inserting 5 lines (multi-line wrap) shifts every line at or after the old line 505 by +5. Verify nothing in `docs/`, `scripts/`, or other tests references those line numbers before commit (grep `triage.test.ts:` under `docs/` and the repo at large). If any reference exists, prefer the single-line assertion form to minimize drift, OR update the reference in the same commit.
- **Risk: the multi-line wrap conflicts with Prettier / ESLint / `tsc` formatting on the file.** Mitigation: this file already uses multi-line `assert.equal` and multi-line type casts (lines 507-510); the new shape matches existing style. If `npm run typecheck` or any post-edit formatter (none currently configured in this repo per `package.json` scripts) flags it, drop to the single-line form.
- **Risk: coverage gate flags the new line as an uncovered branch.** Mitigation: structurally none — `assert.equal` is a single statement with no branch; LCOV records it as executed (the test covers it on every run). The per-file floor for `triage.ts` is unaffected because the change is in `tests/`, which is excluded from coverage per `CLAUDE.md > Commands` (`Excludes dist/, tests/, scripts/`). The aggregate `tests/` exclusion guarantees no coverage-side regression.
- **Risk: the assertion is technically redundant today (single emit is structurally guaranteed by the post-loop + immediate-return shape of the emission site).** Mitigation: this is the entire point of the cycle — pin the invariant at the test layer so a future refactor that loses the structural guarantee can't drift it unnoticed. SPEC §Source Issue and §Objective document this rationale; no further action needed.
- **Risk: someone reads the new assertion and thinks the `find` lookup at line 503 is now redundant and removes it.** Mitigation: the `find` lookup binds the event for the payload-shape assertions at lines 505-516; deleting it would break those. The new assertion does not subsume `find` — it pins cardinality, the `find` + `assert.ok` pair pins existence-and-payload. Both must stay. Comment is unnecessary (the surrounding payload checks make the dependency self-evident); rely on the test failing if `find` is removed.
```
