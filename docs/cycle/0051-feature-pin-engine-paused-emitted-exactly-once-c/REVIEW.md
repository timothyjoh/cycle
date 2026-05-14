Gates pass. 368/368 tests, typecheck clean, coverage gate ok (triage.ts 99.72% ≥ 95%). Diff matches SPEC + PLAN exactly. Emitting REVIEW.md to stdout.

```markdown
# Review: Cycle 0051

## Overall Verdict
PASS — no fixes needed.

## Code Quality Review

### Summary
Minimal, precise test-layer pin. Single +5-line assertion added inside the existing whole-pass-failure test in `tests/engine/triage.test.ts` between the `assert.ok(paused, ...)` existence check and the `paused?.fields.reason` payload check. No production code touched. Placement, wording, and form match SPEC and PLAN verbatim.

### Findings
1. **Adherence**: Diff is exactly +5 lines, zero deletions, scoped to the single canonical test body — `tests/engine/triage.test.ts:505-509`.
2. **Idiom match**: Multi-line `assert.equal(...)` wrap mirrors the existing `lastErrors` cast style at `tests/engine/triage.test.ts:512-515`.
3. **Message wording**: `"engine.paused must fire exactly once per whole-pass failure"` names "exactly once" per SPEC Requirements bullet 4; mirrors the sibling existence-check message at line 504 for visual symmetry.
4. **Mutation-kill**: A hypothetical duplicate `log.emit("engine.paused", ...)` at `src/engine/triage.ts:229-244` would produce `events.filter(...).length === 2`, failing the new assertion with `expected 1, got 2` before the payload-shape assertions at lines 510-521 ever run — fail-fast cardinality regression caught.
5. **Out-of-scope sibling tests** (multi-raw at line 536, unknown-agent at line ~804) intentionally not modified — SPEC explicitly excludes them; this is correct.

### Spec Compliance Checklist
- [x] Assertion uses `events.filter((e) => e.event === "engine.paused").length === 1` form, not `find` + sibling-bound check — `tests/engine/triage.test.ts:506`.
- [x] Lives in same test body as existing payload-shape assertions — inside `test("whole-pass failure: only raw fails all attempts → engine.paused", …)` at line 487.
- [x] Message names "exactly once" — `tests/engine/triage.test.ts:508`.
- [x] No production-code edits — `src/engine/triage.ts` untouched (verified via `git diff`).
- [x] No new test cases, no new fixtures, no new helpers.
- [x] No docs touched (per SPEC §Documentation Updates — vacuously satisfied).
- [x] `npm test` passes 368/368.
- [x] `npm run typecheck` clean.
- [x] Per-file floor preserved: `src/engine/triage.ts` line 99.72% ≥ 95%.

## Adversarial Test Review

### Summary
Strong. The new assertion directly pins the cardinality invariant — `filter(...).length === 1` — rather than the weaker `find(...) !== undefined` existence form. Specific assertion (`assert.equal` with exact expected value 1), named message, fail-fast placement before payload checks. No new mocking, no shared state, no order dependency — reuses the existing per-test tmp-repo + `makeLog()` setup.

### Findings
1. **Assertion specificity**: `assert.equal(filter.length, 1, msg)` — exact equality, not truthiness. Strong.
2. **Mock surface**: zero net new mocks. Existing `TriageDeps.runAgent` injection + `makeLog()` event capture are reused; no module-level stubs introduced.
3. **Test independence**: assertion is added inside the existing per-test isolated tmp repo (line 488 `setupRepo()` → `finally rm(root, recursive)`). No cross-test state.
4. **Mutation testing (reasoning-only, per SPEC §Acceptance Criteria)**: a double-emit at the emission site fails cardinality first; a zero-emit fails the prior `assert.ok(paused, ...)` first; a wrong-payload mutation still fails the payload-shape checks at lines 510-521. All three mutation classes have a single owning assertion.
5. **No happy-path-only concern**: this assertion *is* the regression guard — the surrounding payload-shape and filesystem-move checks already cover the success-side payload contract.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: **99.05% / 92.78% / 96.30%** (aggregate, identical to cycle-0050 baseline)
- Per-file (`src/engine/triage.ts`): **line 99.72%, branch 97.78%, function 97.50%** — unchanged, well above the 95% floor.
- Regressions vs base (per-file): **none**.
- New code without tests: **none** (the change *is* the test).
- Specific scenarios missing tests: **none in scope**. Cardinality pins on the sibling multi-raw whole-pass test (`tests/engine/triage.test.ts:536`) and the unknown-agent test (~line 804) are explicitly out of scope per SPEC §Out of Scope; deferring them is the documented call.

## Notes
- Coverage gate output: `coverage-gate: ok — src/engine/triage.ts 99.72% ≥ 95%`.
- Test count: 368/368 (unchanged vs cycle-0050 baseline — same test, +1 assertion).
- Working-tree state at review time: target diff is exactly +5 lines on `tests/engine/triage.test.ts`; other unstaged/untracked entries are pre-existing cycle-0050 housekeeping (REFLECTION.md, refl-0050 raw materializations) not part of this cycle's scope.
```

No MUST-FIX.md written — implementation is clean, complete, spec-compliant.

`★ Insight ─────────────────────────────────────`
- `filter(...).length === 1` is structurally stronger than `find(...) !== undefined`: the latter only proves ≥1, the former pins exactly 1. The pattern generalizes — wherever a "fires exactly once" invariant exists in event-driven code, pin it with `filter.length`, not `find`.
- This is a defensive test against a *future* refactor, not present code. Such test-layer pins are cheap (5 lines, no executable branch under `src/`, no coverage impact) and pay off the first time someone moves an emit site inside a loop without thinking.
- The reasoning-validated red phase ("don't commit the mutation") is the right call when the mutation would be obviously wrong to anyone reading the diff. It saves a commit-revert pair without sacrificing rigor — the assertion's shape (`.length, 1`) makes the mutation-kill self-evident.
`─────────────────────────────────────────────────`
