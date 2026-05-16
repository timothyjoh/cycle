Both files confirmed. Writing the plan now.

# Implementation Plan: Cycle 0086

## Overview
Insert `--dangerously-skip-permissions` as the first CLI arg in the `spawn("claude", …)` call in `src/engine/exec-claudecode.ts`, and add the corresponding assertion in `tests/engine/exec-claudecode.test.ts` (which cycle 0085 failed to deliver).

## Current State (from Research)
- `src/engine/exec-claudecode.ts:13` spawns `"claude", ["-p", prompt]` — flag is absent.
- `tests/engine/exec-claudecode.test.ts:22` asserts only `/SPECCED/`; no `--dangerously-skip-permissions` assertion exists.
- The SPEC assumed the test assertion landed in cycle 0085 — it did not. Both changes are needed.
- Fake-binary test harness: `#!/bin/bash\necho SPECCED $@\n` — echoes all args to stdout, so adding the flag will appear in `r.stdout`.

## Desired End State
`exec-claudecode.ts:13` reads:
```ts
const child = spawn("claude", ["--dangerously-skip-permissions", "-p", prompt], {
```
`exec-claudecode.test.ts` test 1 has two consecutive assertions:
```ts
assert.match(r.stdout, /SPECCED/);
assert.match(r.stdout, /--dangerously-skip-permissions/);
```
`npm test` passes. `git diff master...HEAD` is non-empty.

## What We're NOT Doing
- Changing any other spawn args or flags.
- Modifying `settings.local.json`.
- Changing workflow YAML or `.cycle/` config.
- Adding new test cases (only extending the existing test 1 assertion).
- Any refactoring of `exec-claudecode.ts` beyond the one arg insertion.

## Implementation Approach
Two minimal surgical edits. Task 1 fixes the source; Task 2 pins the fix with a test assertion. Both are one-liners. No new files, no structural changes.

---

## Task 1: Insert `--dangerously-skip-permissions` arg in exec-claudecode.ts

### Overview
Add the flag as the first element in the args array passed to `spawn`.

### Changes Required
**File**: `src/engine/exec-claudecode.ts`

**Line 13 — before:**
```ts
      const child = spawn("claude", ["-p", prompt], {
```
**Line 13 — after:**
```ts
      const child = spawn("claude", ["--dangerously-skip-permissions", "-p", prompt], {
```

### Success Criteria
- [ ] `src/engine/exec-claudecode.ts:13` contains `"--dangerously-skip-permissions"` before `"-p"`
- [ ] `npm run typecheck` exits 0
- [ ] `npm run build` exits 0

---

## Task 2: Add `--dangerously-skip-permissions` assertion in exec-claudecode.test.ts

### Overview
Extend test 1's assertion block so removing the flag from the source causes the test to fail.

### Changes Required
**File**: `tests/engine/exec-claudecode.test.ts`

**After line 22 (`assert.match(r.stdout, /SPECCED/);`), insert:**
```ts
    assert.match(r.stdout, /--dangerously-skip-permissions/);
```

Result (lines 21–23 after edit):
```ts
    assert.equal(r.status, "ok");
    assert.match(r.stdout, /SPECCED/);
    assert.match(r.stdout, /--dangerously-skip-permissions/);
```

### Why this works
The fake `claude` binary echoes `$@`. With the flag inserted, stdout will be:
```
SPECCED --dangerously-skip-permissions -p Write a one-line spec.
```
Both `/SPECCED/` and `/--dangerously-skip-permissions/` match. Reverting Task 1 breaks only the second assertion — confirming the pin is live.

### Success Criteria
- [ ] `tests/engine/exec-claudecode.test.ts:23` contains `/--dangerously-skip-permissions/` assertion
- [ ] `npm test` exits 0 with all tests passing
- [ ] Manually removing `"--dangerously-skip-permissions"` from Task 1 causes test 1 to fail on the new assertion (pin verification)

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] src/engine/exec-claudecode.ts:13` reads `spawn("claude", ["--dangerously-skip-permissions", "-p", prompt], {` | Task 1 | Exact one-line edit |
| `[ ] git diff master...HEAD` is non-empty and contains the one-line flag insertion | Task 1 | Edit produces non-empty diff |
| `[ ] npm test` passes — including the `--dangerously-skip-permissions` assertion in `tests/engine/exec-claudecode.test.ts` | Task 2 | Assertion added; passes after Task 1 |
| `[ ] BUILD.md shows the change landed (not a no-op or permission error)` | WAIVED — BUILD.md is written by the build step agent, not this plan; the plan verifies via `git diff` and test output instead |
| `[ ] No compiler/linter warnings introduced` | Task 1 | Verified via `npm run typecheck` + `npm run build` |

---

## Testing Strategy

### Unit Tests
- Test 1 in `tests/engine/exec-claudecode.test.ts`: fake binary echoes args; assert `/SPECCED/` (existing) + `/--dangerously-skip-permissions/` (new). Real subprocess execution — no mocking needed.
- Test 2 (ENOENT path) is unaffected; no changes needed.

### Integration / E2E Tests
- `npm test` is the full suite; no additional integration harness needed for a one-arg insertion.

## Risk Assessment
- **False-positive test** (arg present in PATH noise): The fake binary echoes only `$@`, not env vars or binary name — output is deterministic. Low risk.
- **Existing test still passes after Task 1 before Task 2**: Yes — `/SPECCED/` still matches. Task order doesn't matter for green-suite, but Task 1 → Task 2 is the logical sequence.
- **`settings.local.json` write-blocking**: This plan assumes operator-assisted application (Edit tool directly in the parent session). The cycle engine subprocess cannot self-apply; the operator applies both edits before or during the build step.
