Plan ready. Two-line test-regex tightening. Single vertical slice.

```markdown
# Implementation Plan: Cycle 0061

## Overview
Tighten two `assert.match` patterns in `tests/cli/halt.test.ts` to use strict full-line anchors (`/^…$/m`), aligning with the adjacent `last_cycle_id` assertion. Test-only hardening — no production source touched.

## Current State (from Research)
- `tests/cli/halt.test.ts:266` uses loose prefix anchor `/^failed_step: verify/m`.
- `tests/cli/halt.test.ts:267` uses loose prefix anchor `/^failed_attempts: 1/m`.
- Adjacent strict-anchor template at line 268 already uses `/^last_cycle_id: "${cycleId}"$/m`; blocked-by assertions at lines 299–300 use the same strict form. Pattern to mirror is established and local.
- Fixture is deterministic: `workflowYml(2, 1)` at `tests/cli/halt.test.ts:71-87` pins step name `verify` and `max_cycle_attempts: 1`, so values `verify` / `1` reach `terminalDrain` (`src/cli.ts:135-137`) verbatim. Strict anchors will continue to match.
- Loose `^failed_at: /m` at line 265 stays loose intentionally (ISO timestamp).

## Desired End State
- `tests/cli/halt.test.ts:266` reads `assert.match(failedBody, /^failed_step: verify$/m);`.
- `tests/cli/halt.test.ts:267` reads `assert.match(failedBody, /^failed_attempts: 1$/m);`.
- Verify: open file, `npm test` green (full suite), `npm run typecheck` clean, coverage gates hold (line ≥ 95%, branch ≥ 75%, func ≥ 90%, `src/engine/triage.ts` ≥ 95%).

## What We're NOT Doing
- Not touching any other line in `tests/cli/halt.test.ts` (including the intentionally loose `failed_at` line 265).
- Not sweeping other test files for similar loose-anchor patterns. If a similar gap is noticed incidentally during the edit, surface it in REFLECTION.md — do not fix here.
- Not modifying `src/cli.ts` `terminalDrain`, queue logic, blocked propagation, or the halt fixture (`workflowYml`).
- Not adding new test cases. Existing assertions are simply being hardened.
- No README / CLAUDE.md / AGENTS.md updates — convention is already implicit via the adjacent `last_cycle_id` assertion.

## Implementation Approach
One vertical slice: two literal regex edits at known line numbers in one test file, verified by re-running the existing halt test through `npm test`. The fixture already produces the exact `failed_step: verify` and `failed_attempts: 1` lines the strict patterns require, so green-on-first-run is the expected outcome. Mutation verification is by inspection only: strict patterns reject `verify_extended` and `11`, where loose patterns would have accepted them.

---

## Task 1: Right-anchor `failed_step` and `failed_attempts` assertions

### Overview
Replace two loose `/^<key>: <value>/m` patterns with strict `/^<key>: <value>$/m` patterns in the halt test.

### Changes Required
**File**: `tests/cli/halt.test.ts`

**Change 1 — line 266**:
```ts
// before
assert.match(failedBody, /^failed_step: verify/m);
// after
assert.match(failedBody, /^failed_step: verify$/m);
```

**Change 2 — line 267**:
```ts
// before
assert.match(failedBody, /^failed_attempts: 1/m);
// after
assert.match(failedBody, /^failed_attempts: 1$/m);
```

No other edits. Line 265 (`/^failed_at: /m`) and line 268 (`last_cycle_id` strict template) remain untouched.

### Success Criteria
- [ ] Both lines match the new strict form exactly (verified by reading the file post-edit).
- [ ] `npm test` exits 0 — the halt test (`propagateBlocked moves dependent to blocked/...`) still passes against the deterministic fixture.
- [ ] `npm run typecheck` exits 0 with no warnings.
- [ ] `npm run test:coverage` passes the per-file gate (`src/engine/triage.ts ≥ 95%`) and overall thresholds (line ≥ 95%, branch ≥ 75%, func ≥ 90%). No regression expected — the change is in a test file, coverage-neutral for `src/`.
- [ ] `git diff` shows exactly two changed lines in `tests/cli/halt.test.ts` and no other files modified.

---

## Testing Strategy

### Unit Tests
- No new unit tests. The existing halt test at `tests/cli/halt.test.ts:237-276` exercises these assertions against the deterministic `workflowYml(2, 1)` fixture; tightening the regex doesn't require additional cases.
- Mocking: none. The test already bootstraps a real temp repo, spawns the bundled CLI, and reads real filesystem artifacts — the anti-mock bias is already satisfied.

### Integration / E2E Tests
- `npm test` is the integration verification path: it auto-builds `dist/cycle.js` via `pretest`, then runs the full suite including the halt fixture. A green run with the strict patterns confirms `terminalDrain` continues to emit the exact lines `failed_step: verify` and `failed_attempts: 1` (no trailing whitespace, no decoration).
- Mutation sanity by inspection: the new patterns reject `failed_step: verify_extended` and `failed_attempts: 11`. No regression test needed — the change itself is a pin-tightening.

## Risk Assessment
- **Risk: `mutateFrontmatter` emits trailing whitespace on the `failed_step` or `failed_attempts` line, which the old loose pattern silently accepted.** Mitigation: `npm test` will fail the assertion on first run, surfacing the issue immediately. If it does fail, treat as a real bug in `mutateFrontmatter` and escalate via MUST-FIX rather than relaxing the pattern.
- **Risk: drift in workflow step name from `verify` to something else.** Mitigation: `workflowYml(2, 1)` at `tests/cli/halt.test.ts:71-87` hard-codes the single step name `verify`; nothing else in scope can change it. The strict anchor will only break if the fixture itself is intentionally edited, which is out of scope.
- **Risk: coverage regression from a stray edit elsewhere.** Mitigation: `git diff` check in success criteria — the diff must touch only the two specified lines.
```
