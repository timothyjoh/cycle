All context resolved. Writing PLAN.md now.

# Implementation Plan: Cycle 0087

## Overview

Add `"--dangerously-skip-permissions"` as the first arg in the `spawn("claude", ...)` call in `src/engine/exec-claudecode.ts`, and pin its presence with an `assert.match` assertion in `tests/engine/exec-claudecode.test.ts`. Applied operator-direct — not via engine subprocess.

## Current State (from Research)

- `src/engine/exec-claudecode.ts:13`: `spawn("claude", ["-p", prompt], {` — flag absent
- `tests/engine/exec-claudecode.test.ts:22`: only `/SPECCED/` assertion present; no assertion for `--dangerously-skip-permissions`
- Fake-binary test writes `#!/bin/bash\necho SPECCED $@\n` — `$@` expands all positional args, so the new flag will appear in stdout automatically once the spawn call is fixed
- Nine prior cycles (0079, 0081–0086) failed due to `settings.local.json` blocking write ops in engine subprocesses; this cycle applies the fix directly from the operator session

## Desired End State

```
grep -n 'dangerously-skip-permissions' src/engine/exec-claudecode.ts
# → 13:      const child = spawn("claude", ["--dangerously-skip-permissions", "-p", prompt], {

npm test  # exits 0, all tests pass
```

Both files match their post-condition exactly. No other files change.

## What We're NOT Doing

- No changes to `src/engine/exec.ts`, `src/engine/child-env.ts`, or any other file
- No changes to `settings.local.json` or permission config
- No refactoring of the exec module
- No new tests beyond the single assertion addition

## Implementation Approach

Two surgical edits, one verification run. Task 1 mutates the spawn args array. Task 2 adds one `assert.match` line immediately after the existing `/SPECCED/` assertion. Both edits are non-breaking; the test already exercises the full invocation path and the fake binary already echoes `$@`.

---

## Task 1: Add `--dangerously-skip-permissions` to spawn args

### Overview

Insert the flag as the first positional arg so every engine-spawned Claude subprocess runs without the permission gate.

### Changes Required

**File**: `src/engine/exec-claudecode.ts`

**Line 13** — change:
```ts
// before
const child = spawn("claude", ["-p", prompt], {
// after
const child = spawn("claude", ["--dangerously-skip-permissions", "-p", prompt], {
```

### Success Criteria

- [ ] `grep -n 'dangerously-skip-permissions' src/engine/exec-claudecode.ts` returns line 13
- [ ] No other lines in the file changed

---

## Task 2: Add test assertion pinning the flag

### Overview

Assert that `--dangerously-skip-permissions` appears in the fake-claude stdout capture, preventing silent regression.

### Changes Required

**File**: `tests/engine/exec-claudecode.test.ts`

**After line 22** (immediately after `assert.match(r.stdout, /SPECCED/)`), insert:
```ts
assert.match(r.stdout, /--dangerously-skip-permissions/);
```

### Success Criteria

- [ ] Line 23 (or immediately after the `/SPECCED/` assertion) reads `assert.match(r.stdout, /--dangerously-skip-permissions/);`
- [ ] No other lines in the file changed

---

## Task 3: Verify

### Overview

Run the full test suite to confirm both changes integrate cleanly and coverage floors hold.

### Changes Required

None — read-only verification.

### Steps

```sh
grep -n 'dangerously-skip-permissions' src/engine/exec-claudecode.ts
npm test
```

### Success Criteria

- [ ] `grep` returns exactly one hit on line 13
- [ ] `npm test` exits 0
- [ ] No coverage regression (global line ≥ 95%, branch ≥ 75%, func ≥ 90%)

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `1. src/engine/exec-claudecode.ts:13` contains `"--dangerously-skip-permissions"` as the first element of the args array. | Task 1 | Direct one-line edit |
| `2. tests/engine/exec-claudecode.test.ts` contains an `assert.match` call verifying `--dangerously-skip-permissions` appears in the fake-claude stdout capture. | Task 2 | One-line insertion after existing `/SPECCED/` assertion |
| `3. npm test` exits 0 with all assertions passing. | Task 3 | Verification run |

---

## Testing Strategy

### Unit Tests

- Test 1 in `exec-claudecode.test.ts` ("invokes claude -p with prompt body, captures stdout") already exercises the full spawn path with the fake binary. Adding `assert.match(r.stdout, /--dangerously-skip-permissions/)` directly after the existing assertion is sufficient — no new test function needed.
- The fake binary echoes `$@` (all positional args), so the flag will appear in `r.stdout` if and only if it is present in the spawn args array. No mocking required; the test uses a real subprocess.

### Integration / E2E Tests

- `npm test` runs the full suite via Node native test runner. The existing two-test file covers both the success path (Task 1 + Task 2 assertion) and the ENOENT error path (unaffected by this change).

## Risk Assessment

- **Flag position**: `--dangerously-skip-permissions` must precede `-p`; Claude CLI parses flags before positional args. Verified correct position in the "after" snippet — no risk.
- **Fake binary echo**: `$@` expands all args including flags starting with `--`; no quoting or escaping issues.
- **Coverage regression**: adding one assertion line to an existing test cannot decrease coverage; exec-claudecode.ts already has full line coverage from test 1.
- **Silent success repeat**: test assertion in Task 2 is the guard — if Task 1 is skipped, test 2 fails loudly, preventing another false-positive drain.
