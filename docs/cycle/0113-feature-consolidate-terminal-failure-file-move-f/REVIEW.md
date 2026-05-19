REVIEW.md goes to stdout per the engine protocol. Here it is:

---

# Review: Cycle 0113

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md

NEEDS-FIX trigger: `src/engine/issue-lifecycle.ts` branch coverage is **46.15%** (7 of 13 branches tested). Per-file gate passes (line coverage 97.53% ≥ 95% floor), but branch coverage is not gated per-file and is masked by the 91.47% aggregate. BUILD.md says "all gates pass" without disclosing the per-file branch number — the aggregate stat conceals a genuine gap in the unit tests.

## Code Quality Review

### Summary
Clean extraction. Body is verbatim, import pruning is exact, typecheck is clean, all four call sites in `cli.ts` are intact. No behavioral change introduced. All four PLAN tasks complete as specified.

### Findings
1. **Import prune — correct**: `src/cli.ts:1,19` — `writeFile`, `unlink`, `mutateFrontmatter`, `serializeFrontmatter`, `Frontmatter`, `drainFailedTerminal`, `propagateBlocked` all removed; `parseFrontmatter` kept (used at lines 199, 330). `terminalDrain` wired at line 24. No issues.

2. **ENGINE.md diff is cycle 0112 work, not 0113**: The ENGINE.md changes visible in the working tree were authored by cycle 0112. Cycle 0113 BUILD.md lists no doc file changes. Not a defect in 0113.

### Spec Compliance Checklist
- [x] `terminalDrain` extracted to `src/engine/issue-lifecycle.ts`
- [x] Import wired back in `src/cli.ts`
- [x] All 4 call sites intact (`src/cli.ts:260,270,366,387`)
- [x] `tests/engine/issue-lifecycle.test.ts` covers happy path
- [x] `tests/engine/issue-lifecycle.test.ts` covers `mutateFrontmatter` fallback
- [x] No behavior changes — body copied verbatim
- [x] `scripts/coverage-gate.mjs` FLOORS extended with `"src/engine/issue-lifecycle.ts": 95`
- [x] PLAN.md `## SPEC Acceptance Traceability` section present, covers all implied SPEC bullets

## Adversarial Test Review

### Summary
Weak branch coverage. Two tests exist and pass, assertions are specific, no mocking (real filesystem throughout — good). But 7 of 13 branches are never entered.

### Findings
1. **Uncovered: happy-path rename catch (lines 74–75)** — `rename(todoPath, failedPath)` never throws in Test 1 because `setupRepo()` creates `failedDir`. The entire `catch` block is dead. These are the two lines the coverage report highlights red. `tests/engine/issue-lifecycle.test.ts` — no test covers this branch. → **MUST-FIX (Task 1)**

2. **Uncovered: fallback parseFrontmatter catch (line 45)** — `parseFrontmatter("")` (triggered when `readFile` catches ENOENT → `originalBody = ""`) returns without throwing. The `catch` at line 45 is never entered. → **MUST-FIX (Task 2)**

3. **Uncovered: non-ENOENT rethrow branches (lines 37, 63)** — Both catch-and-rethrow guards in the fallback path have only their ENOENT-swallow branch covered. Rethrow paths require permission manipulation; acceptable to leave untested given the no-mock constraint.

4. **Silent data loss path unobserved**: happy-path rename ENOENT → catch swallowed → queue drained, todo file stamped in place but not moved to `failed/`. Pre-existing behavior from `cli.ts`, not a 0113 regression. No regression introduced; noted for future.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function (aggregate): 99.07% / 91.47% / 97.16%
- **`src/engine/issue-lifecycle.ts` per-file: 97.53% line / 46.15% branch / 100% function**
- Regressions vs base (per-file): none (line coverage; branch not gated per-file)
- Uncovered lines reported: 74–75
- Scenarios missing tests: happy-path rename ENOENT; fallback with parseFrontmatter-rejecting content

## Doc-vs-Code Claim Verification

No documentation prose changed; pass skipped.

---

MUST-FIX.md written to `docs/cycle/0113-feature-consolidate-terminal-failure-file-move-f/MUST-FIX.md`. Two tasks: Task 1 adds a test that omits `failedDir` from setup (rename ENOENT, covers lines 74–75); Task 2 adds a test that triggers the `parseFrontmatter` throw path (covers line 45 catch block).
