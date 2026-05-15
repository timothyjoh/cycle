---
id: refl-0071-spec-template-should-pin-sync-defaults-e
source: reflection
title: spec-template-should-pin-sync-defaults-exit-code-language-to-divergence-guard-reality
added_at: "2026-05-15T21:18:28.796Z"
triage_attempts: 0
priority_hint: 3
origin_cycle_id: "0071"
---

Cycle 0071's SPEC.md acceptance #3 reads `... after npm run sync-defaults runs cleanly (exit 0)`. The canonical divergence guard documented in `CLAUDE.md` exits 2 whenever `.cycle/workflows.yml` is in the divergent set, which is the project's documented steady state. BUILD.md and REVIEW.md both flagged the literal mismatch; MUST-FIX Task 2 declared it a no-op observation queued for future SPEC wording.

The forward-looking work is to stop minting feature-cycle SPECs with `exit 0` language whenever `src/defaults/` is touched. The CLAUDE.md `sync-defaults divergence guard` paragraph already has the canonical wording; the spec-step prompt at `src/defaults/prompts/spec.md` (or a dedicated SPEC template comment) could carry a one-line directive: when SPEC mentions `npm run sync-defaults`, phrase the success criterion as `changed src/defaults/ → .cycle/ files copy cleanly and diff against source returns empty` rather than `exit 0`, since the dogfood repo's steady-state exit is 2 by design.

Low priority — observation only, not a bug — but worth filing so the next SPEC that touches `src/defaults/` doesn't repeat the wording.
