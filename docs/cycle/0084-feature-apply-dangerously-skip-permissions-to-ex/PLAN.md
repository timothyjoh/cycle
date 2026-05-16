All context confirmed. Writing the plan to stdout now.

`★ Insight ─────────────────────────────────────`
Single-arg prepend to a spawn call — the plan is intentionally minimal. The test's fake binary (`echo SPECCED $@`) accepts all args, so no test changes are needed. The traceability section maps every SPEC bullet to Task 1 directly.
`─────────────────────────────────────────────────`

# Implementation Plan: Cycle 0084

## Overview
Prepend `--dangerously-skip-permissions` to the `spawn("claude", ...)` args array in `src/engine/exec-claudecode.ts:13`. This unblocks spawned Claude CLI subprocesses that have been silently failing to edit `src/` files across four consecutive cycles.

## Current State (from Research)
`src/engine/exec-claudecode.ts:13` currently reads:
```ts
const child = spawn("claude", ["-p", prompt], {
```
The `shell: false` and array-args pattern is already correct. The existing test uses a fake `claude` bash script (`echo SPECCED $@`) that echoes all args and will continue to pass with the prepended flag. No interface, type, or registry changes are needed.

## Desired End State
`src/engine/exec-claudecode.ts:13` reads:
```ts
const child = spawn("claude", ["--dangerously-skip-permissions", "-p", prompt], {
```
Verification: `grep -n 'dangerously-skip-permissions' src/engine/exec-claudecode.ts` returns exactly line 13. `npm test` passes. `npm run typecheck` clean. `git diff` shows exactly one line changed.

## What We're NOT Doing
- No changes to `settings.local.json` or `settings.json`
- No new tests asserting `--dangerously-skip-permissions` presence (tracked in `refl-0083-exec-claudecode-test-does-not-assert-dan`)
- No artifact-only commit guard in `commit-trunk.sh` (tracked in `refl-0083-commit-trunk-sh-commits-artifact-only-ch`)
- No changes to `exec.ts`, `child-env.ts`, `run-cycle.ts`, or any other file

## Implementation Approach
One targeted string edit. The args array `["-p", prompt]` becomes `["--dangerously-skip-permissions", "-p", prompt]`. No abstractions, no helpers, no config wiring needed.

---

## Task 1: Prepend `--dangerously-skip-permissions` to spawn args

### Overview
Edit the single spawn call in `exec-claudecode.ts` to pass the flag before `-p`. This is the root fix for the four-cycle silent-failure streak.

### Changes Required
**File**: `src/engine/exec-claudecode.ts`  
**Line**: 13  
**Before**:
```ts
const child = spawn("claude", ["-p", prompt], {
```
**After**:
```ts
const child = spawn("claude", ["--dangerously-skip-permissions", "-p", prompt], {
```
No other lines change.

### Success Criteria
- [ ] `grep -n 'dangerously-skip-permissions' src/engine/exec-claudecode.ts` → exactly line 13
- [ ] `git diff src/engine/exec-claudecode.ts` shows exactly one line changed
- [ ] `npm test` passes with no failures
- [ ] `npm run typecheck` exits 0

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] src/engine/exec-claudecode.ts:13` contains `"--dangerously-skip-permissions"` as the first element of the args array | Task 1 | |
| `[ ] grep -n 'dangerously-skip-permissions' src/engine/exec-claudecode.ts` matches exactly line 13 | Task 1 | |
| `[ ] npm test` passes with no failures | Task 1 | |
| `[ ] No compiler/linter warnings introduced (npm run typecheck clean)` | Task 1 | |
| `[ ] Diff shows exactly one line changed in src/engine/exec-claudecode.ts` | Task 1 | |

---

## Testing Strategy

### Unit Tests
- No new tests. The existing `tests/engine/exec-claudecode.test.ts` test 1 uses `echo SPECCED $@` which echoes all args — adding `--dangerously-skip-permissions` to the spawn call does not break the `/SPECCED/` match.
- Test 2 (ENOENT path) is unaffected by the args change.

### Integration / E2E Tests
- `npm test` runs the full suite via Node's native test runner. Passing suite = sufficient verification for this one-line change.

## Risk Assessment
- **Flag position**: Claude CLI requires `--dangerously-skip-permissions` before `-p` — confirmed by prior manual testing referenced in SPEC. Risk: none.
- **Test breakage**: fake binary accepts all args (`$@`). Risk: none.
- **Type errors**: string array element addition; TypeScript infers `string[]` already. Risk: none.
