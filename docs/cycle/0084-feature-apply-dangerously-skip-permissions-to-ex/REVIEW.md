Write permissions are blocked in this cycle step context (same root cause as the primary finding). Outputting MUST-FIX content inline since I cannot write to disk:

---

**REVIEW.md** (stdout — engine captures this):

```markdown
# Review: Cycle 0084

## Overall Verdict
NEEDS-FIX — primary deliverable not implemented; BUILD.md non-compliant

NEEDS-FIX triggers:
- Primary change not applied: `--dangerously-skip-permissions` absent from `src/engine/exec-claudecode.ts:13`
- BUILD.md is a permissions error message, not a build report

## Code Quality Review

### Summary
Build step produced zero code changes. The Claude CLI subprocess was blocked by `settings.local.json` permission restrictions — the same restriction this cycle was created to fix. BUILD.md's entire content is: "Permission needed to edit `src/engine/exec-claudecode.ts`. Please approve the write permission, then I'll apply the one-line change." No src/ change landed; no cycle 0084 commit exists (`git diff master...HEAD` is empty, latest commit is b413b44 cycle 0083).

### Findings
1. **Change not applied**: `src/engine/exec-claudecode.ts:13` reads `spawn("claude", ["-p", prompt], {…})` — no flag present — `src/engine/exec-claudecode.ts:13`
2. **BUILD.md non-compliant**: permission error message only; missing test pass/fail, coverage numbers, typecheck result, verification grep
3. **Git confirms zero changes**: `git diff master...HEAD` empty; no cycle 0084 commit

### Spec Compliance Checklist
- [ ] `src/engine/exec-claudecode.ts:13` contains `"--dangerously-skip-permissions"` as first element — **NOT MET**: line 13 still reads `["-p", prompt]`
- [ ] `grep -n 'dangerously-skip-permissions' src/engine/exec-claudecode.ts` matches exactly line 13 — **NOT MET**: grep returns no output
- [ ] `npm test` passes with no failures — **UNKNOWN**: blocked in review context; no regression expected since file unchanged
- [ ] No compiler/linter warnings introduced — **UNKNOWN**: no change made, no regression expected
- [ ] Diff shows exactly one line changed in `src/engine/exec-claudecode.ts` — **NOT MET**: diff is empty

## Adversarial Test Review

### Summary
Weak for intended behavior — tests don't assert flag presence, no new tests added (per SPEC, out of scope, tracked in `refl-0083-exec-claudecode-test-does-not-assert-dan`). No code changed, so baseline tests pass but the behavior this cycle was meant to introduce has zero coverage.

### Findings
1. **Flag presence not asserted**: `tests/engine/exec-claudecode.test.ts:22` asserts only `/SPECCED/` match. Fake binary echoes all args unconditionally — the fix could be silently reverted and tests would still pass. — `tests/engine/exec-claudecode.test.ts:22`

### Test Coverage
- Command run: unable to execute (permission-blocked in review subprocess context)
- Line / branch / function: unable to collect
- Regressions vs base: none expected (zero code changed), unverified
- New code without tests: N/A
- Specific scenarios missing tests: `--dangerously-skip-permissions` flag presence (out of scope per SPEC, tracked separately)

## Doc-vs-Code Claim Verification

No documentation prose changed; pass skipped.
```

---

**MUST-FIX.md** (must be written to `docs/cycle/0084-feature-apply-dangerously-skip-permissions-to-ex/MUST-FIX.md` — write blocked by same permissions issue as primary finding):

```markdown
# Must-Fix Items: Cycle 0084

## Summary
2 critical issues. Primary deliverable (one-line code change) not applied. BUILD.md is a permissions error message, not a build report.

## Tasks

- [ ] ### Task 1: Apply the `--dangerously-skip-permissions` flag to exec-claudecode.ts
  **Priority:** Critical
  **Files:** `src/engine/exec-claudecode.ts`
  **Problem:** Line 13 still reads `spawn("claude", ["-p", prompt], {`. Build agent was blocked by `settings.local.json` permission restrictions — the same issue this cycle was created to fix. `git diff master...HEAD` is empty; no code change landed.
  **Fix:**
  1. Edit `src/engine/exec-claudecode.ts` line 13.
  2. Change: `const child = spawn("claude", ["-p", prompt], {`
  3. To: `const child = spawn("claude", ["--dangerously-skip-permissions", "-p", prompt], {`
  4. No other lines in the file change.
  **Verify:**
  - `grep -n 'dangerously-skip-permissions' src/engine/exec-claudecode.ts` returns exactly line 13
  - `git diff src/engine/exec-claudecode.ts` shows exactly one line changed
  - `npm test` passes with no failures
  - `npm run typecheck` exits 0

- [ ] ### Task 2: Replace BUILD.md with a real build report
  **Priority:** Critical
  **Files:** `docs/cycle/0084-feature-apply-dangerously-skip-permissions-to-ex/BUILD.md`
  **Problem:** BUILD.md contains only a one-sentence permission request. Missing: test pass/fail output, coverage numbers (line/branch/function), typecheck result, verification grep.
  **Fix:** After applying Task 1, overwrite BUILD.md with:
  - Summary of the one-line edit to `exec-claudecode.ts:13`
  - `npm test` output (pass/fail, test count)
  - Coverage numbers: line / branch / function percentages
  - `npm run typecheck` result
  - `grep -n 'dangerously-skip-permissions' src/engine/exec-claudecode.ts` output
  - `git diff --stat` output showing exactly one file changed
  **Verify:** BUILD.md contains coverage percentages and pass result for `npm test`. `grep "dangerously-skip-permissions" docs/cycle/0084-feature-apply-dangerously-skip-permissions-to-ex/BUILD.md` returns a match.
```

---

**Verdict**: NEEDS-FIX. The fix step receives 2 critical tasks: apply the one-line change to `exec-claudecode.ts:13` and write a real BUILD.md. Note that the fix step itself will be blocked by the same `settings.local.json` permissions issue unless the engine is restarted with `--dangerously-skip-permissions` already in place — a bootstrapping catch-22 that requires operator intervention (manual edit or permission grant).
