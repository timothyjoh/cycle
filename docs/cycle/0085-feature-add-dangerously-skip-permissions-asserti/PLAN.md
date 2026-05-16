Both files verified. Writing the plan to stdout.

```markdown
# Implementation Plan: Cycle 0085

## Overview
Add `--dangerously-skip-permissions` to the `claude` CLI spawn args in `src/engine/exec-claudecode.ts` and pin its presence with a regression assertion in test 1 of `tests/engine/exec-claudecode.test.ts`. Two-line change; closes the silent-drop gap that let four consecutive cycles (0079, 0081, 0082, 0083) silently omit the flag.

## Current State (from Research)
- `exec-claudecode.ts:13`: `spawn("claude", ["-p", prompt], ...)` — args array contains only `"-p"` and `prompt`; flag is absent.
- `exec-claudecode.test.ts:22`: `assert.match(r.stdout, /SPECCED/)` — single stdout assertion; no check for `--dangerously-skip-permissions`.
- Test 1 fake binary (`#!/bin/bash\necho SPECCED $@\n`) echoes all positional args via `$@`, so adding the flag to the spawn args makes it appear in stdout automatically — no fake binary change needed.
- Test 2 (ENOENT path) is unaffected.

## Desired End State
- `exec-claudecode.ts:13` args array: `["-p", prompt, "--dangerously-skip-permissions"]`
- `exec-claudecode.test.ts` test 1 has two stdout assertions: `/SPECCED/` (existing) and `/--dangerously-skip-permissions/` (new)
- `npm test` passes
- Removing `--dangerously-skip-permissions` from `exec-claudecode.ts` causes test 1 to fail with an assertion error on the new regex

## What We're NOT Doing
- Changing any other spawn args or CLI flags
- Modifying how permissions are resolved or configured elsewhere
- Touching workflow YAML, `.cycle/` config, or any other engine files
- Adding per-file coverage floors for `exec-claudecode.ts`
- Changing the fake binary or test 2

## Implementation Approach
Atomic two-file change: source first, then test. The test is an integration test against a real subprocess — no mocks, no test-infrastructure changes needed. The fake binary's `$@` passthrough means the assertion validates actual runtime behavior.

---

## Task 1: Add `--dangerously-skip-permissions` to spawn args

### Overview
Extend the args array in `exec-claudecode.ts` so `claude` is always invoked with the flag.

### Changes Required
**File**: `src/engine/exec-claudecode.ts`  
**Line 13** — change:
```ts
const child = spawn("claude", ["-p", prompt], {
```
to:
```ts
const child = spawn("claude", ["-p", prompt, "--dangerously-skip-permissions"], {
```

### Success Criteria
- [ ] `src/engine/exec-claudecode.ts:13` args array contains `"--dangerously-skip-permissions"` as third element
- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0

---

## Task 2: Add regression assertion to exec-claudecode test 1

### Overview
Pin the flag's presence in the spawn args by asserting it appears in the fake binary's stdout.

### Changes Required
**File**: `tests/engine/exec-claudecode.test.ts`  
**After line 22** (`assert.match(r.stdout, /SPECCED/);`) — insert:
```ts
    assert.match(r.stdout, /--dangerously-skip-permissions/);
```

### Success Criteria
- [ ] Test 1 has `assert.match(r.stdout, /--dangerously-skip-permissions/)` after the existing `/SPECCED/` assertion
- [ ] `npm test` exits 0 with both changes present
- [ ] Removing `--dangerously-skip-permissions` from `exec-claudecode.ts` causes test 1 to fail with an `AssertionError` on the new regex

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] src/engine/exec-claudecode.ts spawn call includes --dangerously-skip-permissions in args array` | Task 1 | Line 13 args array |
| `[ ] Test 1 in tests/engine/exec-claudecode.test.ts has assert.match(r.stdout, /--dangerously-skip-permissions/) after the existing /SPECCED/ assertion` | Task 2 | Inserted after line 22 |
| `[ ] npm test passes with both changes present` | Task 1 + Task 2 | Verified after both land |
| `[ ] Removing --dangerously-skip-permissions from exec-claudecode.ts causes test 1 to fail` | Task 2 | New assertion creates the regression pin |
| `[ ] No compiler/linter warnings introduced` | Task 1 + Task 2 | `npm run typecheck` exits 0 |

---

## Testing Strategy

### Unit Tests
- Test 1 (`invokes claude -p with prompt body, captures stdout`): add `assert.match(r.stdout, /--dangerously-skip-permissions/)` after the existing `/SPECCED/` assertion. The fake binary echoes `$@`, so this directly validates the flag was passed at spawn time.
- No mocking — this is an integration test against a real subprocess via PATH override.

### Integration / E2E Tests
- `npm test` (full suite) must pass after both changes.
- Manual regression check: temporarily remove `--dangerously-skip-permissions` from `exec-claudecode.ts`; verify test 1 fails; restore.

## Risk Assessment
- **No-op if flag already present**: `exec-claudecode.ts` was fixed in cycle 0083/0084 but the test never pinned it. Reading the file confirms the flag is still absent at HEAD (line 13: `["-p", prompt]`), so both changes are needed.
- **Fake binary echo order**: `echo SPECCED $@` outputs the flag after `SPECCED` — `/--dangerously-skip-permissions/` regex matches anywhere in stdout, so ordering doesn't matter.
- **Coverage**: Adding an assertion doesn't reduce coverage. No new code paths — no coverage regression risk.
```
