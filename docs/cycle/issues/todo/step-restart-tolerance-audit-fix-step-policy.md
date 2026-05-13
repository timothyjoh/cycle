---
id: step-restart-tolerance-audit-fix-step-policy
title: Define + enforce restart policy for `fix` step (partial fixes already applied)
workflow: feature
depends_on: []
triaged_at: "2026-05-13T18:17:01.544Z"
source: triage
parent: step-restart-tolerance-audit
---
## Why

The `fix` step re-reads `MUST-FIX.md` and applies the staff-engineer review feedback. If the engine halts mid-fix and resumes, BB-5 re-runs `fix` — but some of the must-fix items may already be applied on the branch. There is no defined behavior today; the agent may re-apply the same edit (no-op or merge-conflict-ish), skip ahead, or get confused.

We need either:

1. **Skip-if-done semantics.** The `fix` prompt explicitly re-evaluates each item in `MUST-FIX.md` against the current code and only applies items that are not yet satisfied. Requires a structured `MUST-FIX.md` format the agent can check off, or a re-evaluation loop the prompt enforces.
2. **Hard reset to pre-fix HEAD.** Same shape as the build-step option: roll back the branch and re-run fix from scratch.

## Acceptance

- Pick policy 1 or 2 in `SPEC.md` with trade-off note.
- If policy 1: update `src/defaults/prompts/fix.md` so the agent reads `MUST-FIX.md`, inspects current code, and only applies still-needed items. Document the prompt expectation in CLAUDE.md under "Resume from log tail".
- If policy 2: same mechanism as `step-restart-tolerance-audit-build-step-policy` — record pre-fix SHA, reset on resume.
- Add an engine test that:
  1. Drives the workflow through a partial `fix` (some items applied, others not).
  2. Simulates a halt (truncate `step.end` for `fix` from `log.jsonl`).
  3. Resumes and asserts the final branch state is the same as a clean `fix` run (no double-applied edits, no missed items).
- `npm test` + `npm run typecheck` pass.
- Coverage does not regress (line ≥ 95%, branch ≥ 75%, func ≥ 90%).

## Out of scope

- Restart-tolerance of `build` (separate child).
- Restart-tolerance of prompt-overwrite + already-idempotent steps (separate child).
