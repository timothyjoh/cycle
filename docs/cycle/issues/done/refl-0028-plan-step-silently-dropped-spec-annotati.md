---
id: refl-0028-plan-step-silently-dropped-spec-annotati
title: Tighten SPEC→PLAN traceability so plan step cannot silently drop SPEC acceptance bullets
workflow: feature
depends_on: []
triaged_at: "2026-05-13T21:20:16.310Z"
source: triage
---
## Problem

Cycle 0028 surfaced a SPEC→PLAN traceability gap: `SPEC.md § Documentation Updates` enumerated four RFC-001 lines requiring annotation (10, 390, 392, 416). `PLAN.md` Task 2 silently reduced the verification list to three (10, 390, 416). BUILD applied three. REVIEW caught the gap as MUST-FIX Task 1. FIX patched it with a section-level prelude.

The cycle absorbed the slip, but the SPEC→PLAN gate is weak: nothing in the `plan` step prompt enforces that every SPEC acceptance bullet maps to a plan task or is explicitly waived with rationale.

## Direction

Two viable approaches (pick one in PLAN; the other is the alternative to weigh against):

1. **Cheap win — prompt tweak (recommended starting point):** Edit `src/defaults/prompts/plan.md` to require an explicit acceptance-criteria checklist that re-enumerates every SPEC acceptance bullet (verbatim, by section + bullet index), and asserts each is either (a) covered by a numbered plan task, or (b) explicitly waived with a one-line rationale. Reject the plan artifact in `review` if the checklist is missing or incomplete.

2. **More robust — static verify check:** Add a deterministic step (or extend `verify`) that parses `SPEC.md` acceptance bullets and `PLAN.md` task IDs and diffs them, failing the cycle if any SPEC bullet has no covering task or waiver. Heavier (needs a stable bullet/task identifier convention in both artifacts) but enforced by the engine rather than agent discipline.

The prompt tweak is the cheap immediate win. The static check is the durable fix and is worth doing once the convention stabilizes — they're complementary, not exclusive.

## Acceptance

- `plan` prompt requires explicit SPEC-bullet → plan-task mapping (or waiver with rationale).
- A plan artifact lacking the mapping fails `review` (or earlier).
- Regression test: a SPEC with N acceptance bullets and a PLAN covering only N-1 must fail before reaching `build`.
- Document the convention in `CLAUDE.md` or RFC-001 so future workflow edits preserve it.

## Out of scope

- Retroactive audit of past cycle PLAN.md files.
- Generalizing the check to non-`feature` workflows (do it for `feature` first; extend later if other workflows grow SPEC artifacts).

## Origin

Cycle 0028 reflection. Priority hint 5.
