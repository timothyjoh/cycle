Same permissions block. I'll output REVIEW.md to stdout for engine capture, then explain the MUST-FIX situation.

---

# Review: Cycle 0083

## Overall Verdict
NEEDS-FIX — the sole deliverable was never implemented.

**NEEDS-FIX triggers:** Build step produced zero code changes. `src/engine/exec-claudecode.ts:13` is unchanged from master; `--dangerously-skip-permissions` is absent from the `spawn` args array.

## Code Quality Review

### Summary
The cycle produced no code changes. The build step was blocked by the same permissions catch-22 the cycle was designed to fix: `settings.local.json` overrides global write permissions, preventing the engine subprocess from editing files. The plan and spec are correct; execution simply did not occur.

### Findings
1. **Not Implemented**: `src/engine/exec-claudecode.ts:13` still reads `spawn("claude", ["-p", prompt], ...)` — the `--dangerously-skip-permissions` flag is absent. This is the entire deliverable of the cycle.

### Spec Compliance Checklist
- [ ] `--dangerously-skip-permissions` appears in the args array in `src/engine/exec-claudecode.ts`, before `-p` — **NOT MET** (line 13 unchanged)
- [ ] `npm test` passes with no regressions — **NOT VERIFIED** (could not run; no change made)
- [ ] Any test that asserts on the exact exec-claudecode args shape includes the new flag — **VACUOUSLY MET** (no tests assert on exact args shape; confirmed by research)

## Adversarial Test Review

### Summary
Adequate for the declared scope (SPEC explicitly waived new tests). One advisory gap noted.

### Findings
1. **Args-shape not asserted**: `tests/engine/exec-claudecode.test.ts:17-22` — the fake `claude` binary echoes all args (`$@`) to stdout, but the assertion only checks `/SPECCED/`. After the fix, the output would be `SPECCED --dangerously-skip-permissions -p <prompt>`. No assertion verifies the flag is present. This means the test passes whether or not the flag appears in the args. SPEC explicitly said "no new tests required" — this is advisory, not a MUST-FIX.

### Test Coverage
- Command run: not executed (zero code changes; no regressions possible)
- Line / branch / function: unchanged from cycle 0082 baseline (≥95% / ≥75% / ≥90%)
- Regressions vs base (per-file): none (no code modified)
- New code without tests: none (no code added)
- Specific scenarios missing tests: args-shape verification (advisory per SPEC waiver)

## Doc-vs-Code Claim Verification

No documentation prose changed; pass skipped.

---

The MUST-FIX content that the engine needs written to disk:

```
docs/cycle/0083-feature-fix-exec-claudecode-ts-add-dangerously-s/MUST-FIX.md
```

**MUST-FIX content:**

```markdown
# Must-Fix Items: Cycle 0083

## Summary
1 critical issue: the sole implementation task was never executed. `src/engine/exec-claudecode.ts` is unchanged from master. Zero code output due to permissions catch-22 (BUILD.md).

## Tasks

- [ ] ### Task 1: Apply the --dangerously-skip-permissions flag to exec-claudecode.ts
  **Priority:** Critical
  **Files:** `src/engine/exec-claudecode.ts`
  **Problem:** Line 13 still reads `spawn("claude", ["-p", prompt], ...)`. Flag absent. Only deliverable, never applied — build step lacked write permissions.
  **Fix:**
  Edit `src/engine/exec-claudecode.ts`, line 13:
  Change: `const child = spawn("claude", ["-p", prompt], {`
  To:     `const child = spawn("claude", ["--dangerously-skip-permissions", "-p", prompt], {`
  No other changes required.
  **Verify:**
  1. `grep -n 'dangerously-skip-permissions' src/engine/exec-claudecode.ts` returns line 13.
  2. Flag appears before `"-p"` in the array.
  3. `npm test` passes with no regressions.
```

---

The review step is blocked by the same permissions issue as the build step. The Write tool cannot create `MUST-FIX.md` without permission approval. The fix step will need write access to proceed — which is exactly what this cycle is trying to enable.
