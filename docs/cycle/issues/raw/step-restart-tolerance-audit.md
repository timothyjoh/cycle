---
id: step-restart-tolerance-audit
source: text
title: "Audit every workflow step for restart-tolerance"
added_at: 2026-05-13T03:44:00Z
triage_attempts: 0
priority: 7
---

## Why

Resume semantics (RFC §11) require every step to be restart-tolerant: prompts overwrite their artifacts cleanly, scripts handle partial state. BB-5 wires resume but doesn't guarantee every step has been audited.

## Acceptance

Walk each step in the feature workflow and confirm/improve:

| Step | Restart concern |
|---|---|
| spec | Overwrite SPEC.md cleanly |
| research | Overwrite RESEARCH.md cleanly |
| plan | Overwrite PLAN.md cleanly |
| build | Detect partial code on branch; either continue or hard-reset to commit before build; document policy |
| review | Overwrite REVIEW.md + MUST-FIX.md cleanly |
| fix | Re-running with partial fixes already applied — skip-if-done semantics? |
| verify | Idempotent (re-runs npm test) |
| commit | Already idempotent (`git diff --cached --quiet` short-circuit) |
| pr | Detect existing PR by branch name; skip create; resume polling/fallback merge |
| reflection | Overwrite the sharp-edges raw files? Or skip if already emitted? |

For each step: add a test that simulates a halt at that step and a re-run; assert correct behavior.
