All context confirmed. Writing PLAN.md now.

```markdown
# Implementation Plan: Cycle 0197

## Overview
Add one missing assertion (`ev.cycle_id`) to Test A in the `documentation.paths_appended` test suite, closing a payload-contract gap where a `cycleId` vs `cycle_id` key-name regression would pass undetected.

## Current State (from Research)
- `src/engine/run-cycle.ts:99` already emits `{ cycle_id: cycleId, appended: toAppend }` correctly
- Test A (`tests/engine/run-cycle.documentation.test.ts:526`) calls `expectExactlyOne` and gets back the full event object but only asserts `ev.appended` — never `ev.cycle_id`
- Fixture `issueId` is `"PATHS-APPENDED-1"` (line 517), which flows through as `cycle_id` in the emitted event
- `assert` already imported at line 2; no new imports needed

## Desired End State
`tests/engine/run-cycle.documentation.test.ts:527` reads:
```ts
assert.equal(ev.cycle_id, "PATHS-APPENDED-1");
```
immediately after line 526. All 558+ tests pass. Coverage gates still met.

## What We're NOT Doing
- No changes to production code (`src/`)
- No changes to Test B (the no-emit case at line 535)
- No new test helpers or infrastructure
- No changes to any other test files

## Implementation Approach
Single-line insertion into one test file. The insertion point, value, and assertion form are fully determined by existing code — no design decisions required.

---

## Task 1: Add ev.cycle_id assertion to Test A

### Overview
Insert `assert.equal(ev.cycle_id, "PATHS-APPENDED-1")` after the `expectExactlyOne` call in Test A, before the existing `ev.appended` assertions. This follows the placement convention established at lines 194–196 and 236–238 in the same file.

### Changes Required
**File**: `tests/engine/run-cycle.documentation.test.ts`

Insert after line 526 (`const ev = expectExactlyOne(events, "documentation.paths_appended");`):
```ts
assert.equal(ev.cycle_id, "PATHS-APPENDED-1");
```

Result (lines 526–529 after change):
```ts
const ev = expectExactlyOne(events, "documentation.paths_appended");
assert.equal(ev.cycle_id, "PATHS-APPENDED-1");
assert.ok(Array.isArray(ev.appended));
assert.ok((ev.appended as string[]).includes("README.md"));
```

### Success Criteria
- [ ] `assert.equal(ev.cycle_id, "PATHS-APPENDED-1")` appears immediately after the `expectExactlyOne` call in Test A
- [ ] `npm test` passes (all 558+ tests green)
- [ ] `npm run test:coverage` passes; all per-file coverage floors still met
- [ ] `npm run typecheck` clean — no warnings
- [ ] No other files modified

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] assert.equal(ev.cycle_id, "PATHS-APPENDED-1") added in Test A immediately after the expectExactlyOne call` | Task 1 | |
| `[ ] The assertion value matches the issueId used in the test fixture ("PATHS-APPENDED-1")` | Task 1 | Fixture line 517 confirmed |
| `[ ] npm test passes with the new assertion in place` | Task 1 | |
| `[ ] npm run test:coverage passes; coverage gates still met` | Task 1 | |
| `[ ] All existing tests still pass` | Task 1 | |
| `[ ] No compiler/linter warnings introduced` | Task 1 | |

---

## Testing Strategy

### Unit Tests
- The changed file IS the test — no separate unit tests needed
- After insertion: mutate `cycle_id` → `cycleId` in `run-cycle.ts:99` to confirm the new assertion fails (manual sanity-check per SPEC testing strategy)

### Integration / E2E Tests
- `npm test` runs the full suite including Test A end-to-end with a real temp dir and fake binary
- Coverage gate via `npm run test:coverage` confirms no regressions

## Risk Assessment
- **TypeScript type mismatch**: `expectExactlyOne` returns `any`-typed event object — `ev.cycle_id` access is valid with no cast needed. Risk: none.
- **Wrong fixture value**: Confirmed `"PATHS-APPENDED-1"` at line 517. Risk: none.
- **Coverage regression**: Test files are not under per-file coverage floors; adding a test line cannot decrease source coverage. Risk: none.
```
