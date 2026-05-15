---
id: refl-0071-missing-spec-plan-traceability-verify-gr
title: Make MUST-FIX SPEC→PLAN traceability verify command fence-aware (no false positives on didactic code examples)
workflow: quickfix
depends_on: []
triaged_at: "2026-05-15T21:26:15.192Z"
source: triage
---
## Problem

The MUST-FIX `Missing SPEC→PLAN Traceability` task shape in `src/defaults/prompts/review.md` instructs the reviewer to verify the fix via:

```
grep -c "^## SPEC Acceptance Traceability$" PLAN.md
```

and expect `1`. In cycle 0071's own PLAN.md this returns `2` because the literal header text also appears inside the Task 1 fenced-code example at `PLAN.md:57` (the example showing the agent what to emit). `FIX.md` accepted the deviation as substantive-intent-met, but every future MUST-FIX traceability fix will trip the same false positive whenever PLAN.md or REVIEW.md *describes* the section in a fenced example.

The verify check is doing the right thing semantically — count *live* section headers, not header text inside code examples — but the regex cannot distinguish the two.

## Chosen approach: fence-aware count (option a)

Rewrite the verify command so it counts only header occurrences that are NOT inside a ```` ``` ```` fenced block. Reflection's own preferred approach is an awk pass that toggles an in-fence flag across triple-backtick lines and only counts the header when the flag is off. Concretely, replace the grep with something like:

```
awk '/^```/{f=!f; next} !f && /^## SPEC Acceptance Traceability$/{n++} END{print n+0}' PLAN.md
```

Expected output: `1` for a correctly-fixed PLAN.md, even when the same header text also appears inside one or more fenced examples. Update the MUST-FIX template's verify line in `src/defaults/prompts/review.md`, and mirror to the dogfood `.cycle/prompts/review.md` (run `npm run sync-defaults`).

Reject options (b) distinctive marker — would also require plan template surgery and creates a new convention to remember — and (c) relax to ≥1 — defeats the point of the verify check.

## Acceptance Criteria

- `src/defaults/prompts/review.md` MUST-FIX `Missing SPEC→PLAN Traceability` template's verify command is fence-aware and emits `1` against PLAN.md files that legitimately have the section even when the header literal also appears inside fenced examples.
- Same template's verify command emits `0` against PLAN.md files that lack the section entirely (negative case unchanged).
- `.cycle/prompts/review.md` MUST-FIX template is byte-identical to `src/defaults/prompts/review.md` (sync-defaults run, divergence guard satisfied).
- A regression test under `tests/defaults/` parses the updated MUST-FIX block out of `src/defaults/prompts/review.md`, executes the embedded verify command (or its parsed equivalent) against three fixtures: (i) PLAN.md with one live section + one fenced example header → `1`; (ii) PLAN.md with one live section + zero fenced examples → `1`; (iii) PLAN.md with zero live sections + one fenced example → `0`.
- CLAUDE.md note added under the existing SPEC→PLAN traceability paragraph noting the fence-aware verify convention so any future analogous MUST-FIX templates copy the same shape.

## Notes / Caveats

- This is a prompt + dogfood-mirror + test-fixture change; no `src/engine/` code touched.
- Coverage policy applies only to `src/`; the regression test still belongs under `tests/defaults/` to enforce the byte-identical mirror invariant.
- Workflow: `feature` (dogfood `no_branch: true` runs apply via `.cycle/workflows.yml`).
