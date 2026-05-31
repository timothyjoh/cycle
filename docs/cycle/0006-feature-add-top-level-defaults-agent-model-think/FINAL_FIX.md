## Summary

Applied the single task from `FINAL_FIXES.md`.

**Fix 1: docs-workflows-canonical-schema-stale-after-defaults-rewrite** — Reconciled the canonical schema example at the top of `docs/workflows.md` with the shipped-defaults rewrite:

- Corrected line 13 from "three top-level sections" to "four top-level sections — `engine`, `triage`, `defaults` (optional), and `workflows`".
- Added the `defaults: { agent: claudecode }` block to the example YAML so the section list and the snippet agree.
- Converted the example `feature` steps to the defaults-inheritance form — removed the per-step `agent: claudecode` from each agent step (matching the style now shipped in `src/defaults/workflows.yml`/`.cycle/workflows.yml`), keeping the explicit `agent: bash` on the `verify` step, and annotated the first step to show the agent is inherited.
- Added a clarifying note that per-step `agent:` is optional once `defaults.agent` is set, that the `defaults` block itself is optional, and a cross-link to the existing `Top-level defaults` section.

This removes the two contradictory step styles and the undercounted section list, closing the drift the cycle's MUST-FIX Task 1 was meant to fix.

**Test-suite outcome:** `npm test` passes — 773 tests, 0 failures, 0 skipped. (This fix is documentation-only; it touches `docs/workflows.md`, which is within the cycle footprint and is a documentation file, and introduces no code changes.)

No tasks left unfixed.
