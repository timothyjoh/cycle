All write paths blocked — same permissions bootstrapping issue that's plagued cycles 0083–0085. Including MUST-FIX.md content inline for the operator.

---

**REVIEW.md** (stdout, captured by engine):

```markdown
# Review: Cycle 0085

## Overall Verdict
NEEDS-FIX — primary deliverables not implemented.

## Code Quality Review

### Summary
The build step exited 0 but made zero code changes. Both SPEC deliverables (`--dangerously-skip-permissions` in spawn args; test assertion pinning it) are absent from the codebase. BUILD.md contains only a permission request, not a build report. This is a false-positive build exit.

### Findings
1. **SPEC deliverable 1 missing**: `src/engine/exec-claudecode.ts:13` still reads `spawn("claude", ["-p", prompt], {...})` — `--dangerously-skip-permissions` not added.
2. **SPEC deliverable 2 missing**: `tests/engine/exec-claudecode.test.ts:22` still only has `assert.match(r.stdout, /SPECCED/)` — no `--dangerously-skip-permissions` assertion.
3. **Build step false positive**: BUILD.md body is "Need write permission for `src/engine/exec-claudecode.ts` and `tests/engine/exec-claudecode.test.ts`. Please approve the edit requests — two files, two lines changed total." Build agent emitted exit 0 despite making no changes.
4. **npm test**: Blocked by permission restrictions — could not execute. Based on current source state, test 1 would pass (only checks `/SPECCED/`), meaning the missing pin is invisible to the test suite — which is exactly the bug this cycle was supposed to fix.

### Spec Compliance Checklist
- [ ] `src/engine/exec-claudecode.ts` spawn call includes `--dangerously-skip-permissions` in args array — **NOT DONE** (line 13 confirmed absent)
- [ ] Test 1 in `tests/engine/exec-claudecode.test.ts` has `assert.match(r.stdout, /--dangerously-skip-permissions/)` after the existing `/SPECCED/` assertion — **NOT DONE** (line 22 confirmed absent)
- [ ] `npm test` passes with both changes present — **UNVERIFIABLE** (changes not made; permissions blocked test run)
- [ ] Removing `--dangerously-skip-permissions` from `exec-claudecode.ts` causes test 1 to fail — **UNVERIFIABLE** (assertion not added)
- [ ] No compiler/linter warnings introduced — **N/A** (no changes made)

## Adversarial Test Review

### Summary
Weak — the regression pin this cycle was designed to add does not exist.

### Findings
1. **Missing regression pin**: Test 1 (`tests/engine/exec-claudecode.test.ts:8-27`) asserts only `/SPECCED/`. Any future cycle that drops `--dangerously-skip-permissions` from the spawn args will not be caught. This is the exact silent-drop pattern that caused cycles 0079, 0081, 0082, 0083 to ship without the flag.
2. **Build false positive**: Build step exit 0 with no code changes gives the engine no signal that deliverables are missing. The empty-diff guard (cycle 0080) should have caught this.

### Test Coverage
- Command run: `npm test` — **blocked by permissions, not executed**
- Line / branch / function: unknown
- Regressions vs base: none (no code changed)
- New code without tests: N/A
- Specific scenarios missing tests: `--dangerously-skip-permissions` presence in spawn args — the pin that was supposed to be added

## Doc-vs-Code Claim Verification

No documentation prose changed; pass skipped.
```

---

**MUST-FIX.md** (could not write to disk — operator must create manually or approve write):

```markdown
# Must-Fix Items: Cycle 0085

## Summary
2 critical issues. Build step exited 0 without applying any code changes — both SPEC deliverables are unimplemented.

## Tasks

- [ ] ### Task 1: Add `--dangerously-skip-permissions` to exec-claudecode.ts spawn args
  **Priority:** Critical
  **Files:** `src/engine/exec-claudecode.ts`
  **Problem:** Line 13 reads `spawn("claude", ["-p", prompt], {...})`. Flag absent. This is the primary deliverable of cycles 0083, 0084, AND 0085 — none succeeded in writing it.
  **Fix:** Change `exec-claudecode.ts:13` from:
    `const child = spawn("claude", ["-p", prompt], {`
  to:
    `const child = spawn("claude", ["-p", prompt, "--dangerously-skip-permissions"], {`
  **Verify:** `grep -n 'dangerously-skip-permissions' src/engine/exec-claudecode.ts` returns line 13.

- [ ] ### Task 2: Add `--dangerously-skip-permissions` assertion to exec-claudecode test 1
  **Priority:** Critical
  **Files:** `tests/engine/exec-claudecode.test.ts`
  **Problem:** Line 22 has only `assert.match(r.stdout, /SPECCED/)`. No assertion pins the flag. Future cycles can silently drop it (as happened in cycles 0079, 0081, 0082, 0083).
  **Fix:** After `tests/engine/exec-claudecode.test.ts:22`, insert:
    `    assert.match(r.stdout, /--dangerously-skip-permissions/);`
  **Verify:** Apply both tasks, run `npm test` — passes. Temporarily remove flag from `exec-claudecode.ts:13`, run `npm test` again — test 1 fails with `AssertionError` on the new regex. Restore flag.
```

---

**Note for operator:** The cycle 0085 build step couldn't write due to `settings.local.json` permission restrictions — the same bootstrapping problem that blocked cycles 0083 and 0084. The fix is two lines of code, both known exactly. If you approve the write, I can apply them now directly.
