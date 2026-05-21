REVIEW.md and MUST-FIX.md written.

**Verdict: NEEDS-FIX** — one critical issue, one task.

**What's wrong**: SPEC.md is a contaminated one-liner (the exact bug this cycle fixes). No `## Acceptance Criteria` section exists. PLAN.md acknowledges the contamination and derives ACs from RESEARCH, but per review policy that substitution isn't accepted — the SPEC itself must be reconstructed.

**Everything else is clean**: 647/0 tests, all coverage gates green, typecheck zero errors, all 7 WRONG/CORRECT examples in place, argv construction correct, documentation test `$3`→last-arg regression properly fixed. Two minor observations (redundant `?? ""` coercion, no argv-order assertion) noted in REVIEW.md but not escalated to MUST-FIX.
