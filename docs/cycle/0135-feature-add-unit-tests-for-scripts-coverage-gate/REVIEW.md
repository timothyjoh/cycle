Write permission needed for both files. Two findings:

**NEEDS-FIX — 2 issues:**

**Critical — Task 1: Stage the test file**
`tests/scripts/coverage-gate.test.ts` is untracked (`??` in git status). `commitCycle()` ignores `??` entries; the file won't be committed. Fix: `git add tests/scripts/coverage-gate.test.ts`. Verify: `git status tests/scripts/` shows `A  tests/scripts/coverage-gate.test.ts`.

**Minor — Task 2 (Unbacked Doc Claim): Fix CLAUDE.md:35 per-file floors**
The line says `(line ≥ 95% each): triage.ts, issue-lifecycle.ts, commit-cycle.ts`. Committed FLOORS at `scripts/coverage-gate.mjs:12–19` also has `branch.ts: 90` — omitted from the list, and its 90% floor contradicts "≥ 95% each". Fix: add `src/engine/branch.ts` (≥90%) to the list and drop the uniform-percentage phrasing. Verify: `grep "branch.ts" CLAUDE.md` returns updated line; `grep "≥ 95% each" CLAUDE.md` returns nothing.

Please approve writes so I can persist REVIEW.md and MUST-FIX.md to the cycle artifact directory.
