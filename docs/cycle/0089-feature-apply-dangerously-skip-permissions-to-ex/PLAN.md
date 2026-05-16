Both files confirmed. Writing the plan to stdout now.

# Implementation Plan: Cycle 0089

## Overview
Add `--dangerously-skip-permissions` as the first spawn argument in `src/engine/exec-claudecode.ts` and pin its presence with a regression assertion in the test suite. Two edits, one test run.

## Current State (from Research)

- `exec-claudecode.ts:13`: `spawn("claude", ["-p", prompt], {...})` — flag absent
- `exec-claudecode.test.ts:22`: `assert.match(r.stdout, /SPECCED/)` — only assertion on stdout; no flag check
- Fake binary at test line 17 uses `echo SPECCED $@` — `$@` echoes all spawn args, so the new flag will appear in `r.stdout` automatically once added to the spawn array
- No new imports, no new files, no other callers need changes

## Desired End State

After this cycle:
- `grep -n 'dangerously-skip-permissions' src/engine/exec-claudecode.ts` → line 13
- `grep -n 'dangerously-skip-permissions' tests/engine/exec-claudecode.test.ts` → the `assert.match` line
- `npm test` exits 0 with both assertions passing

## What We're NOT Doing

- No changes to `settings.local.json` or `settings.json`
- No changes to other `exec-*` files
- No changes to workflow YAML
- No new test files
- No documentation updates

## Implementation Approach

Two targeted edits applied directly in the operator session (not via engine subprocess — that's the catch-22 these cycles keep hitting). Then verify with `npm test`.

---

## Task 1: Add `--dangerously-skip-permissions` to spawn args

### Overview
Insert the flag as the first positional argument in the `claude` spawn call, before `-p`.

### Changes Required
**File**: `src/engine/exec-claudecode.ts`

**Line 13** — change:
```ts
const child = spawn("claude", ["-p", prompt], {
```
to:
```ts
const child = spawn("claude", ["--dangerously-skip-permissions", "-p", prompt], {
```

### Success Criteria
- [ ] `grep -n 'dangerously-skip-permissions' src/engine/exec-claudecode.ts` returns line 13
- [ ] Flag is first in the array, before `-p`
- [ ] File still compiles (`npm run typecheck` clean)

---

## Task 2: Add regression assertion to test

### Overview
Add `assert.match(r.stdout, /--dangerously-skip-permissions/)` immediately after the existing `/SPECCED/` match in test 1. Because the fake binary echoes `$@`, the flag will appear in stdout once Task 1 is applied.

### Changes Required
**File**: `tests/engine/exec-claudecode.test.ts`

**After line 22** — add:
```ts
assert.match(r.stdout, /--dangerously-skip-permissions/);
```

### Success Criteria
- [ ] `grep -n 'dangerously-skip-permissions' tests/engine/exec-claudecode.test.ts` returns the new line
- [ ] Assertion is immediately after `assert.match(r.stdout, /SPECCED/)` (line 22)

---

## Task 3: Verify with `npm test`

### Overview
Run the full test suite to confirm both assertions pass and no regressions introduced.

### Changes Required
None — verification only.

### Steps
```sh
npm test
```

### Success Criteria
- [ ] `npm test` exits 0
- [ ] Test 1 ("invokes claude -p with prompt body") passes with the new assertion
- [ ] Test 2 ("resolves StepResult{status:failed}...") still passes
- [ ] All other tests still pass

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] \`grep -n 'dangerously-skip-permissions' src/engine/exec-claudecode.ts\` returns line 13` | Task 1 | Direct edit to line 13 |
| `[ ] \`--dangerously-skip-permissions\` is first in the spawn args array, before \`-p\`` | Task 1 | Inserted as index 0 |
| `[ ] \`grep -n 'dangerously-skip-permissions' tests/engine/exec-claudecode.test.ts\` returns the \`assert.match\` line` | Task 2 | Assertion added after line 22 |
| `[ ] \`npm test\` exits 0 with the new assertion exercised` | Task 3 | Full suite run |
| `[ ] All existing tests still pass` | Task 3 | Covered by same `npm test` run |

---

## Testing Strategy

### Unit Tests
- No new test files. Task 2 adds one assertion to the existing test 1 body.
- The fake binary's `$@` echo makes the assertion mechanically correct — no mocking needed beyond what already exists.
- Edge case: if Task 1 is skipped or reverted, the new assertion will fail, catching the regression.

### Integration / E2E Tests
- `npm test` runs the full suite including exec-claudecode tests. Exit 0 = done.

## Risk Assessment
- **Edit applied to wrong line**: Mitigation — Tasks 1 and 2 specify exact line numbers with before/after snippets; verify with grep after each edit.
- **Flag in wrong position** (after `-p` instead of before): Mitigation — SPEC requires index 0; plan specifies `["--dangerously-skip-permissions", "-p", prompt]` explicitly.
- **Test assertion on wrong stdout line**: Mitigation — fake binary echoes `$@` so all args appear; no ordering ambiguity in the match.
