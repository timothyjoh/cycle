---
id: refl-0071-bootstrap-paradox-cycle-changing-an-agen
source: reflection
title: bootstrap-paradox-cycle-changing-an-agent-prompt-cannot-satisfy-rule-in-its-own-plan-step
added_at: "2026-05-15T21:18:28.796Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0071"
---

Cycle 0071's REVIEW.md, Finding 1: the PLAN.md violated the very rule the cycle introduced, because the `plan` step ran with the OLD `src/defaults/prompts/plan.md` and the new traceability requirement only landed in the BUILD step that followed. The MUST-FIX → FIX path then backfilled PLAN.md after the fact, which works but is structurally awkward — the cycle that ships a rule visibly violates it for the lifetime of its plan artifact, modulo the manual backfill.

The same bootstrap pattern will recur on every cycle that edits an agent prompt used by an earlier step of that cycle (plan, research, spec). It is not a one-off. Suggested directions: (1) document this as an explicit pattern in `CLAUDE.md` so reviewers expect it and the FIX path is canonical, OR (2) teach `runCycle` to re-resolve agent prompts from disk on each `step.start` so a prompt edit committed inside the cycle takes effect immediately for downstream steps within the same cycle (`exec.ts` already does per-step dispatch; the cost is recomputing the prompt template path each step), OR (3) add a `bootstrap_prompt_change: true` SPEC field that, when set, instructs review to suppress the prompt-rule-violation finding on the introducing cycle.

Option (1) is the cheapest and probably correct — agent-prompt cycles are rare enough that the explicit FIX backfill is acceptable, but the pattern deserves a paragraph in CLAUDE.md so future agents recognize it instead of re-litigating.
