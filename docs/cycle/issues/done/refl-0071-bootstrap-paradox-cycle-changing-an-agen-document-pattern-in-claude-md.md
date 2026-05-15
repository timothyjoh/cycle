---
id: refl-0071-bootstrap-paradox-cycle-changing-an-agen-document-pattern-in-claude-md
title: "Document bootstrap-paradox pattern in CLAUDE.md: cycle that introduces a prompt rule cannot satisfy it in its own plan step"
workflow: document
depends_on: []
triaged_at: "2026-05-15T21:22:44.077Z"
source: triage
parent: refl-0071-bootstrap-paradox-cycle-changing-an-agen
---
## Context

Surfaced by cycle 0071 reflection. The cycle that introduced the SPEC→PLAN traceability rule (new `## SPEC Acceptance Traceability` section required in PLAN.md, enforced by review.md Pass 1) shipped a PLAN.md that itself violated the rule, because the `plan` step ran with the OLD `src/defaults/prompts/plan.md` — the new requirement only landed in the BUILD step that followed. Review caught it as a NEEDS-FIX finding; the FIX step backfilled the missing traceability section. Net effect: the cycle that ships the rule visibly violates it for the lifetime of its plan artifact, modulo the manual backfill.

This is **not a one-off**. The same bootstrap pattern recurs on every cycle that edits an agent prompt used by an earlier step of that same cycle (plan, research, spec). The current `runCycle` resolves agent prompts once at the start of the workflow; an in-cycle prompt edit is invisible to steps that already ran and to the rest of the current run until the next cycle.

## Options surfaced in reflection

1. **Document the pattern in CLAUDE.md** (cheapest, recommended). One paragraph naming the bootstrap-paradox pattern, stating that the FIX-step backfill is the canonical resolution, and signalling that reviewers should expect (not re-litigate) the plan-artifact violation on the introducing cycle. Future agents recognize the shape instead of treating it as novel.
2. **Per-step prompt re-resolution.** Teach `runCycle` (or `exec.ts`) to re-resolve agent prompts from disk on each `step.start` so a prompt edit committed inside the cycle takes effect immediately for downstream steps within the same cycle. `exec.ts` already does per-step dispatch; cost is recomputing the prompt template path each step. Eliminates the FIX-backfill detour for prompt-edit cycles that affect later (not earlier) steps in the same workflow. Does NOT help when the edited prompt is for a step that already ran (e.g. plan-prompt edit in a cycle that already executed `plan`).
3. **SPEC opt-out field.** Add a `bootstrap_prompt_change: true` SPEC frontmatter field that, when set, instructs review to suppress the prompt-rule-violation finding on the introducing cycle. Avoids the FIX detour but legitimizes rule violation behind a flag.

## Scope of this work

Land option (1) only. Agent-prompt-changing cycles are rare enough that the explicit FIX backfill is acceptable; documenting the pattern is the cheap canonical fix and unblocks future cycles. Options (2) and (3) remain available if the pattern repeats with high frequency or the FIX backfill turns out to be brittle.

## Acceptance criteria

- CLAUDE.md gains a short subsection (under an existing relevant heading or a new one — author's judgment) named something like `## Bootstrap-paradox cycles (prompt rule introduced in same cycle that must satisfy it)` that:
  - Names the pattern explicitly and gives the canonical example (cycle 0071, SPEC→PLAN traceability rule, plan step ran with old prompt, FIX step backfilled).
  - States the canonical resolution: review flags the violation as NEEDS-FIX, the FIX step backfills the missing artifact section, the cycle ships with the rule honored at HEAD.
  - Notes the limitation: the plan artifact in the cycle directory still contains the pre-fix shape; that is expected, not a defect.
  - Optionally cross-references options (2) and (3) as deferred alternatives if the pattern recurs frequently enough to justify engine changes.
- No code changes — CLAUDE.md edit only.
- Review Pass 3 (doc-vs-code claim verification) passes because the new paragraph adds prose, not code/behavioral claims that require pinning.

## Out of scope

- Engine changes to re-resolve prompts per step (option 2).
- SPEC field opt-out (option 3).
- Retroactive PLAN.md edits to prior cycles' archived artifacts.

## References

- Cycle 0071 REVIEW.md Finding 1 (the original surfacing of the violation).
- Cycle 0071 FIX.md (the backfill that closed the finding).
- `src/defaults/prompts/plan.md` (new traceability requirement).
- `src/defaults/prompts/review.md` Pass 1 (enforcement).
