---
id: refl-0071-spec-template-should-pin-sync-defaults-e
title: Pin SPEC wording for sync-defaults success criterion to divergence-guard reality (not `exit 0`)
workflow: document
depends_on: []
triaged_at: "2026-05-15T21:28:28.701Z"
source: triage
---
## Context

Cycle 0071's SPEC.md acceptance criterion #3 read `... after npm run sync-defaults runs cleanly (exit 0)`. The canonical `sync-defaults divergence guard` (documented in `CLAUDE.md`) intentionally exits **2** whenever `.cycle/workflows.yml` is in the divergent set — which is this dogfood repo's documented steady state (trunk-based variant: `no_branch: true`, `commit-trunk.sh`, no `pr` step).

BUILD.md and REVIEW.md both flagged the literal `exit 0` mismatch during cycle 0071. MUST-FIX Task 2 declared it a no-op observation queued for future SPEC wording (the cycle 0071 code change was correct; only the SPEC's success-language was loose).

Observation, not a bug. Priority hint 3 (low). Filed so the next SPEC that touches `src/defaults/` doesn't repeat the wording mistake and trip another reviewer round.

## Goal

Stop minting feature-cycle SPECs whose acceptance criteria phrase `sync-defaults` success as `exit 0` whenever `src/defaults/` is touched. Replace with wording that survives the divergence guard's documented steady-state exit 2.

## Approach (one of)

1. **Spec-prompt directive (preferred, minimal):** Add a one-line guidance clause to `src/defaults/prompts/spec.md` (and dogfood mirror `.cycle/prompts/spec.md`) telling the spec agent: *when SPEC acceptance mentions `npm run sync-defaults`, phrase the success criterion as `changed src/defaults/ → .cycle/ files copy cleanly and diff against source returns empty`, NOT `exit 0` — the divergence guard exits 2 by design when `.cycle/workflows.yml` is in the divergent set.* Cross-reference the `CLAUDE.md` `sync-defaults divergence guard` paragraph as the canonical source.
2. **SPEC-template comment (alternative):** If `spec.md` already has a template/skeleton block, embed the guidance as an inline HTML comment in that template so the agent sees it inline at authoring time.

Pick the cheapest seam. The directive lives in the prompt only — no engine code change, no test surface change beyond the prompt-pinning test that already covers `src/defaults/prompts/spec.md` byte-equivalence with the dogfood mirror.

## Acceptance Criteria

- `src/defaults/prompts/spec.md` carries the new directive about `sync-defaults` success-criterion wording, referencing the divergence-guard exit-code reality.
- Dogfood mirror `.cycle/prompts/spec.md` is byte-identical to `src/defaults/prompts/spec.md` (existing prompt-pinning convention).
- `npm test` passes (existing prompt-pinning test, if any, catches drift; otherwise add a one-liner under `tests/defaults/` matching the cycle 0071 `plan-prompt-spec-traceability.test.ts` style).
- No regression in coverage gates (line ≥ 95%, branch ≥ 75%, function ≥ 90%; per-file `src/engine/triage.ts ≥ 95%`).
- Changed `src/defaults/ → .cycle/` files copy cleanly via `npm run sync-defaults` and `git diff src/defaults/ .cycle/` returns empty for the pair (this is the wording the new directive recommends — eat your own dog food).

## Out of scope

- Changing the divergence guard's exit-code behavior (intentional, documented).
- Retroactively rewriting historical SPECs.
- Any engine-side validation of SPEC acceptance-criterion wording (this is a prompt-level convention, not a runtime gate).

## References

- `CLAUDE.md` → `sync-defaults divergence guard` paragraph (canonical exit-code wording).
- Cycle 0071 `BUILD.md` / `REVIEW.md` / `MUST-FIX.md` Task 2 (where this observation was first surfaced).
- `src/defaults/prompts/spec.md` (insertion site).
- `tests/defaults/plan-prompt-spec-traceability.test.ts` (test-style template if a new pin is needed).
