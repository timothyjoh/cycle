Good. I have all context needed. Writing the plan.

`★ Insight ─────────────────────────────────────`
The SPEC.md here is contaminated with learning-mode narration (the known issue filed in `refl-0209-spec-md-artifacts`). The actual scope is fully recoverable from RESEARCH.md: one missing integration test. This plan has zero implementation risk — it's pure test coverage.
`─────────────────────────────────────────────────`

# Implementation Plan: Cycle 0210

## Overview

Add one missing integration test — prose-before-fence through `validateOutput` — to confirm `stripFences` handles the case end-to-end, then verify all coverage gates pass.

## Current State (from Research)

`stripFences` (log-fmt.ts:5-8) is wired into `validateOutput` (triage.ts:394) via `JSON.parse(stripFences(rawStdout))`. The unit-level prose-before-fence case is already tested in `log-fmt.test.ts:50-56`. The `triage-validator.test.ts:360-366` test only covers a clean fence (no leading prose). Gap: no integration test exercises the prose-before-fence path through `validateOutput`.

## Desired End State

`tests/engine/triage-validator.test.ts` has a test named `"validateOutput: recovers fenced JSON with leading prose"` that passes. `npm run test:coverage && npm run check:coverage` green. Coverage floors for `triage.ts` (95%) and `log-fmt.ts` (100%) maintained.

## What We're NOT Doing

- No changes to `stripFences` implementation.
- No changes to `validateOutput` or `triage.ts`.
- No new test for CRLF fences in the validator (unit test already covers it).
- No additional prose-parsing variants beyond the one gap.

## Implementation Approach

Single test added at the end of `triage-validator.test.ts` following the exact pattern of the existing fenced-JSON test at line 360-366. Build the `rawStdout` as `"Here is the output:\n" + "```json\n" + JSON.stringify(validChildR1Json()) + "\n```"`. Call `validateOutput`, assert `r.ok === true`.

---

## Task 1: Add prose-before-fence integration test to triage-validator.test.ts

### Overview

Adds the one missing test that closes the `stripFences` integration gap identified in the issue.

### Changes Required

**File**: `tests/engine/triage-validator.test.ts`

**Changes**: Append after the existing test at line 366:

```ts
test("validateOutput: recovers fenced JSON with leading prose", () => {
  const inner = validChildR1Json();
  const rawStdout = "Here is the output:\n```json\n" + JSON.stringify(inner) + "\n```";
  const r = validateOutput(rawStdout, fakeRaws as never, [], cfg, new Set());
  assert.equal(r.ok, true, `validator should accept prose+fenced output; reason: ${r.ok ? "" : r.reason}`);
});
```

### Success Criteria

- [ ] `npm run test:coverage` passes (all tests green, including new test)
- [ ] `npm run check:coverage` passes (triage.ts ≥ 95%, log-fmt.ts = 100%)
- [ ] `npm run typecheck` clean
- [ ] New test name appears in test output

---

## SPEC Acceptance Traceability

SPEC.md contains only learning-mode narration (filed as `refl-0209-spec-md-artifacts-contain-learning-mode`). No formal acceptance criteria section exists. The effective acceptance criteria are recovered from RESEARCH.md and the source issue:

| Effective Acceptance Criterion | Covering Task | Notes |
|---|---|---|
| `validateOutput` accepts `rawStdout` containing leading prose before a fenced JSON block | Task 1 | Direct integration test |
| All coverage gates pass (triage.ts ≥ 95%, log-fmt.ts = 100%) | Task 1 | Verified by `check:coverage` run |
| Full test suite green (no regressions) | Task 1 | `npm run test:coverage` |

---

## Testing Strategy

### Unit Tests

Already complete (`log-fmt.test.ts:50-56` covers prose-before-fence at the `stripFences` level). No new unit tests needed.

### Integration / E2E Tests

Task 1 **is** the integration test: prose-prefixed fence through the full `validateOutput` call stack — `stripFences` → `JSON.parse` → schema validation → `ok: true`.

## Risk Assessment

- **`checkReject` signature mismatch**: existing call at line 43 omits the `Set` arg while line 364 passes it — use the line 364 pattern (`new Set<string>()`) to stay consistent with the positive-assertion tests.
- No implementation changes → zero regression risk.
