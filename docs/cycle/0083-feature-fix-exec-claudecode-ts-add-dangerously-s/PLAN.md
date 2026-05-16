Plan is clear. Outputting to stdout for engine capture.

```markdown
# Implementation Plan: Cycle 0083

## Overview
Add `--dangerously-skip-permissions` to the `claude` CLI args array in `src/engine/exec-claudecode.ts`, positioned before `-p`, so engine-spawned subprocesses can perform Write/Edit operations without interactive permission prompts.

## Current State (from Research)
- `src/engine/exec-claudecode.ts:13`: `spawn("claude", ["-p", prompt], ...)` — single change site
- No test asserts on exact args shape; both exec-claudecode tests and all run-cycle tests use fake binaries with loose assertions
- Only `exec.ts` imports `exec-claudecode.ts`; change is transparent to all callers

## Desired End State
`spawn("claude", ["--dangerously-skip-permissions", "-p", prompt], ...)` in `exec-claudecode.ts`. `npm test` passes with zero regressions.

## What We're NOT Doing
- Modifying `settings.local.json`
- Touching any other exec module (`exec-codex.ts`, `exec-gemini.ts`, `exec-bash.ts`)
- Changing permissions model, child-env logic, or test infrastructure

## Implementation Approach
One-line change to the args array. Flag prepended before `-p` per Claude CLI convention (flags before positional args). No test updates required — research confirms no assertion covers exact args shape.

---

## Task 1: Add --dangerously-skip-permissions to spawn args

### Overview
Insert the flag into the `claude` CLI invocation so non-interactive subprocesses bypass the local permission override.

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

No other changes.

### Success Criteria
- [ ] `src/engine/exec-claudecode.ts:13` contains `"--dangerously-skip-permissions"` before `"-p"` in the args array
- [ ] `npm test` passes with no regressions
- [ ] `shell: false` and array-args discipline preserved (no string concatenation, no `exec`)

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] --dangerously-skip-permissions appears in the args array in src/engine/exec-claudecode.ts, before -p` | Task 1 | Direct single-line change at line 13 |
| `[ ] npm test passes with no regressions` | Task 1 | Verified post-change; no test asserts on exact args shape |
| `[ ] Any test that asserts on the exact exec-claudecode args shape includes the new flag` | Task 1 | Research confirms zero tests assert on exact args shape; no test updates needed |

---

## Testing Strategy

### Unit Tests
- `tests/engine/exec-claudecode.test.ts` — 2 existing tests; neither asserts on exact args. Run `npm test` to confirm both still pass after the change.
- No new tests required per SPEC and confirmed by research.

### Integration / E2E Tests
- All `run-cycle.test.ts` tests use fake `claude` binaries with loose assertions on log event shapes. No updates needed.

## Risk Assessment
- **Flag position wrong**: Claude CLI may reject `--dangerously-skip-permissions` after `-p`. Mitigation: place it first in the array (before `-p`), matching standard POSIX flag-before-positional convention. Research confirms this ordering.
- **Future test adds exact args assertion**: Low risk; if it does, the failing test will be self-documenting. No mitigation needed now.
```
