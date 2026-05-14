---
id: refl-0046-spec-ac-6-was-structurally-unreachable-f
source: reflection
title: spec-ac-6-was-structurally-unreachable-from-the-start
added_at: "2026-05-14T16:57:01.574Z"
triage_attempts: 0
priority_hint: 3
origin_cycle_id: "0046"
---

SPEC.md Acceptance Criterion 6 demanded "Slug-collision suffixing still applies if a real `refl-<cycleId>-parse-error` slug collides with another entry in the same pass." PLAN.md, BUILD.md, and REVIEW.md all independently rediscovered that this scenario is structurally unreachable: escalation only fires when `JSON.parse` fails twice, which means zero entries were parsed, which means the in-pass `usedSlugs` Set is empty, which means there is nothing for the escalation file to collide with. BUILD.md substituted a resume-idempotency test, and REVIEW.md accepted the substitution.

Why it matters: SPEC.md is treated as the contract under this workflow (PLAN.md and BUILD.md both reference "AC #N" by number), and shipping a SPEC with an unreachable acceptance criterion forces every downstream artifact to relitigate the same reinterpretation. This is the second time this exact pattern has shown up (see `refl-0029-spec-acceptance-bullet-6-deferred-to-wro` in `.cycle/tbd.jsonl`). Two data points isn't a trend yet, but it suggests the spec step lacks a feasibility-check pass against the implementation surface before the SPEC lands.

Suggested direction: add a one-line "feasibility self-check" instruction to `src/defaults/prompts/spec.md` requiring the spec agent to walk each acceptance criterion against the implementation surface it just researched and reject any criterion whose precondition is structurally impossible. Cheaper than a separate review pass and prevents the reinterpretation tax downstream. Alternatively, allow the plan step to issue a SPEC erratum file (`SPEC-ERRATA.md`) so the disagreement is captured in the artifact dir instead of buried in PLAN/BUILD/REVIEW prose.
