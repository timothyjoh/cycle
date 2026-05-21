---
id: refl-0217-spec-md-negative-example-hardcodes-cycle
source: reflection
title: spec.md negative example hardcodes cycle-0217 path — will stale within one cycle
added_at: "2026-05-21T10:08:08.280Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0217"
---

The concrete negative example added to `src/defaults/prompts/spec.md` at line 129 embeds the literal path `docs/cycle/0217-feature-fix-spec-step-learning-mode-conflict-cau/SPEC.md`. After the next cycle this path becomes a historical artifact rather than a live negative example. As cycles accumulate the example will reference a directory from cycles ago, which risks the model reading it as contextually irrelevant or confusing it with current cycle paths.

The fix is a one-liner: replace the specific path with a generic placeholder such as `docs/cycle/<cycle-id>/SPEC.md` or `docs/cycle/NNNN-feature-<title>/SPEC.md`. The pedagogically important part is the leading confirmation sentence pattern, not the specific path. REVIEW.md noted this as "observation only, no fix required" from a code-correctness standpoint, but the maintenance burden grows with each cycle.
