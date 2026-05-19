REVIEW.md write requires a permission grant. Printing to stdout instead (engine captures stdout):

---

# Review: Cycle 0121

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
Implementation is correct and minimal. The reset loop inserts exactly where PLAN.md specified, follows the `bumpAttempts` try/catch-swallow pattern, and uses the already-imported `mutateFrontmatter`. README updates are complete and accurate. No regressions.

### Findings

1. **Artifact: SPEC.md malformed** — `docs/cycle/0121-feature-reset-triage-attempts-on-retained-raws-a/SPEC.md` contains a permission-grant placeholder message rather than spec content. The file write was blocked mid-run. Not an implementation defect; the issue file at `docs/cycle/issues/todo/refl-0059-triage-attempts-3-on-paused-raw-blocks-r.md` is the source of truth for acceptance criteria and all five are met.

2. **Artifact: PLAN.md wraps content in code block** — The entire plan (including the `## SPEC Acceptance Traceability` section) is embedded inside a ` ```markdown ` fence rather than rendered as top-level markdown. Traceability section IS complete and covers all five acceptance bullets. Structural issue only; content is correct.

3. **ENGINE.md triage section slightly stale** — `docs/ENGINE.md:17` describes the all-fail path but does not mention the new `triage_attempts: 0` reset. This was out of scope per PLAN.md (ENGINE.md not listed in Task 1 or Task 2 touched files) and is acceptable.

### Spec Compliance Checklist

- [x] All-fail pass leaves every retained raw with `triage_attempts: 0` — `src/engine/triage.ts:233-238`
- [x] Reset is before `log.emit("engine.paused")` — ordering confirmed at `triage.ts:228-252`
- [x] Reset uses tmp-rename-atomic `mutateFrontmatter` — same as `bumpAttempts` pattern at `triage.ts:658-665`
- [x] Partial-fail path unchanged — reset loop inside `if (failed.length === raws.length)`, mutually exclusive with partial-fail flush
- [x] README §Recovering from engine.paused updated — four passages updated, manual-reset instruction removed
- [x] Regression test: `triage_attempts: 0` on disk after first pass + `callCount >= 2` on second pass — `tests/engine/triage.test.ts:584-624`

## Adversarial Test Review

### Summary
Adequate. Two-pass regression test exercises the real filesystem without mocking `mutateFrontmatter`. One assertion is weaker than necessary but does not invalidate the test's purpose.

### Findings

1. **Weak callCount bound in regression test** — `tests/engine/triage.test.ts:621`: `assert.ok(callCount >= 2, ...)`. With 2 raws and `MAX_ATTEMPTS = 3`, a correct second pass invokes the agent 6 times (2 raws × 3 attempts). `>= 2` passes even if only one raw had its attempts reset (3 calls). A tighter assertion — `assert.equal(callCount, 6)` or `assert.ok(callCount >= 4)` — would fully enforce "each retained raw" semantics stated in the test name. Mitigated by the fact that `triage_attempts: 0` is verified for both raws on disk before the second pass runs (`triage.test.ts:605-609`), so the structural invariant is already validated separately.

2. **Partial-fail triage_attempts: 3 still asserted** — `tests/engine/triage.test.ts:473` correctly keeps `triage_attempts: 3` for the partial-fail case (files moved via `moveToFailed`). Correctly distinguishes the two paths. Good.

3. **No mock abuse** — `runAgent` stub is 3-line minimal; real `mutateFrontmatter` called; real filesystem used. Anti-mock discipline maintained.

### Test Coverage
- Command run: `npm test` (Node 22.22.2)
- Tests: 442 pass / 0 fail (441 baseline + 1 new regression test)
- Coverage (from BUILD.md; `npm run test:coverage` approval not granted): Line 80.94% / Branch 79.33% / Func 79.44% — all above baseline
- Per-file: `triage.ts` 99.46% >= 95% floor; `issue-lifecycle.ts` 100%; `commit-cycle.ts` 99.53%
- Regressions vs base (per-file): none
- New code without tests: none — reset loop at `triage.ts:232-239` exercised by both the updated two-raw test and the regression test
- Specific scenarios missing tests: fault path (raw deleted mid-flight) pre-existing at `triage.faults.test.ts:268` — no new test needed

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `triage_attempts: 0` stamped into frontmatter at pause boundary | `README.md:137` | `src/engine/triage.ts:235` — `mutateFrontmatter(raw.srcPath, (fm) => ({ ...fm, triage_attempts: 0 }))` | OK |
| "engine resets the counter at the pause boundary so re-triage is not a no-op" | `README.md:137` | `src/engine/triage.ts:228-252` — reset loop inside `if (failed.length === raws.length)` before `log.emit("engine.paused")` | OK |
| "resets the counter at the pause boundary after the per-attempt `bumpAttempts` calls" | `README.md:167` | `triage.ts:658-665` (`bumpAttempts`) runs inside per-raw loop; reset loop runs after loop exits in the all-fail branch | OK |
| Manual `triage_attempts` reset instruction removed | `README.md:194-197` (deletion) | `triage.ts:233-238` — engine performs the reset itself | OK |
| "per-attempt bumps followed by a final reset to `0`" in safety guarantee | `README.md:208` | `triage.ts:233-238` — reset loop follows `bumpAttempts` calls | OK |

---

**PASS. No MUST-FIX.md generated.** Three minor notes: (1) SPEC.md and PLAN.md are malformed artifacts (permission-blocked file write; code-block wrapping) but the implementation satisfies all five acceptance bullets from the issue file. (2) `callCount >= 2` in the regression test could be tightened to `>= 4` or `=== 6` but is mitigated by the preceding disk-state assertions. (3) ENGINE.md:17 is slightly stale but was out of scope.
