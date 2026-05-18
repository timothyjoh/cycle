Need write permission for the cycle docs directory. Outputting REVIEW.md content to stdout (engine captures stdout):

---

# Review: Cycle 0150

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
Implementation is correct and complete. Two new test cases added to `tests/engine/run-cycle.documentation.test.ts` with proper helpers. One notable structural observation: `no_branch: true` is silently ignored by `loadConfig()` (no matching `Workflow` type field), so the new tests exercise the identical production code path as the existing tests. The value of the new tests is in their assertions (`head_sha === undefined`, `expectExactlyOne` cardinality pinning), not in exercising a distinct code branch. This is acknowledged and explicitly documented in PLAN.md.

### Findings

1. **DRY (informational)**: `workflowYmlNoBranch()` is a near-copy of `workflowYml()` differing only by `no_branch: true` on the workflow entry — `tests/engine/run-cycle.documentation.test.ts:33`. Could be one function with a `noBranch?: boolean` param. Intentional per PLAN.md ("keeps concerns clean"). Not a defect.

2. **`no_branch: true` is a no-op** (informational): `loadConfig()` / `loadWorkflows()` don't parse a `no_branch` field on the `Workflow` type. The fixture YAML marker is silently ignored; `engine.commit.mode: trunk` drives actual behavior. Both new tests exercise the same production code path as tests 1–2. The `head_sha` absence holds for any `documentation` step regardless of workflow mode — `documentation` is not in `RESET_ELIGIBLE_STEPS` (`src/engine/run-cycle.ts:25`). This is correct behavior — the tests pin a real invariant.

3. **`step.start` filter lacks explicit step name check** (informational): `expectExactlyOne(events, "step.start")` relies on the single-step fixture to guarantee cardinality — `tests/engine/run-cycle.documentation.test.ts:185`. If a second step were added to the fixture, `expectExactlyOne` would throw, alerting the developer. Adding `assert.equal(stepStart.step, "documentation")` would make the intent explicit but is not required; the cardinality guard is sufficient.

4. **Shell quoting fragility** (informational): In the happy-path test, the fake `claude` binary is written as `"#!/bin/bash\nprintf '%s' '" + summary + "'\n"` — line 166. `summary` contains no special chars so this is safe. Fragile if `summary` ever gains a single quote. Not a current defect.

### Spec Compliance Checklist

- [x] `workflowYmlNoBranch()` helper produces `no_branch: true` workflow fixture with no `pr` step.
- [x] Happy-path: `DOCUMENTATION.md` written; `step.end status:ok`; `cycle.end status:ok`; `step.start` has no `head_sha`.
- [x] Non-fatal-failure: `documentation.skipped {reason: "exec_failed", exit_code: 2}`; `cycle.end status:ok`.
- [x] Both new tests use `expectExactlyOne` for exactly-once event assertions.
- [x] All existing tests unmodified.
- [x] `npm run test:coverage` reported passing by builder (484 tests, 0 failures).
- [x] `npm run check:invariants` reported passing by builder.
- [x] No TypeScript errors reported by builder.

## Adversarial Test Review

### Summary
Strong. New tests use structural JSON parsing + `expectExactlyOne` rather than the regex pattern used in existing tests. All key assertions are present and specific.

### Findings

1. **Cardinality correctly enforced** — single-step fixtures guarantee `expectExactlyOne` on `step.start`/`step.end`/`cycle.end`/`documentation.skipped` is never vacuous. If the fixture grows, the helper catches double-emission. ✓

2. **`head_sha === undefined` uses strict equality** — `assert.equal` is strict (`node:assert` with `strict` import). `run-cycle.ts:204` uses `...(headSha ? { head_sha: headSha } : {})` so the property is absent entirely — property access on absent key returns `undefined`. Assertion is correct. ✓

3. **Non-fatal failure: two independent checks** — `r.status === "ok"` (return value) AND `cycleEnd.status === "ok"` (log). ✓

4. **`DOCUMENTATION.md` absent on failure asserted** — `assert.equal(await fileExists(docFile), false)`. ✓

5. **`exit_code: 2` asserted explicitly** — not just existence of `documentation.skipped`. ✓

6. **Existing tests still use regex assertions** (informational) — tests 1 and 2 use `assert.match(log, /regex/)`. Out of scope per SPEC. Not a defect.

7. **No unit tests for `parseLog()` / `workflowYmlNoBranch()`** — test-only utilities with trivial implementations; acceptable.

### Test Coverage
- Command run: `node --experimental-test-coverage` + `node scripts/coverage-gate.mjs` (per BUILD.md; Node 22 required)
- Line / branch / function: 98.34% / 91.56% / 95.43% (per BUILD.md)
- Regressions vs base (per-file): none; no production code changed
- New code without tests: `workflowYmlNoBranch()` and `parseLog()` are test-only helpers — no production coverage applies
- Specific scenarios missing tests: none; both SPEC scenarios covered

## Doc-vs-Code Claim Verification

No documentation prose changed; pass skipped.
