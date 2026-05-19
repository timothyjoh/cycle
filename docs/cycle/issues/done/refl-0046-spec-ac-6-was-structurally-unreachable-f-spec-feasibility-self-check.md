---
id: refl-0046-spec-ac-6-was-structurally-unreachable-f-spec-feasibility-self-check
title: Add feasibility self-check pass to spec.md prompt to reject structurally unreachable acceptance criteria
workflow: document
depends_on: []
triaged_at: "2026-05-14T16:58:46.582Z"
source: triage
parent: refl-0046-spec-ac-6-was-structurally-unreachable-f
---
## Problem

SPEC.md acceptance criteria are getting shipped with structurally unreachable preconditions. The latest example: cycle 0046 SPEC AC #6 required slug-collision suffixing on the `refl-<cycleId>-parse-error` escalation file, but escalation only fires when `JSON.parse` fails twice — which means zero entries were parsed — which means the in-pass `usedSlugs` Set is empty — so there is nothing for the escalation file to collide with. PLAN.md, BUILD.md, and REVIEW.md all independently rediscovered this and BUILD.md silently substituted a resume-idempotency test, which REVIEW.md accepted.

This is the second instance of the same pattern (see `refl-0029-spec-acceptance-bullet-6-deferred-to-wro`). Two data points is not yet a trend, but the cost is real: every downstream artifact (PLAN/BUILD/REVIEW) has to relitigate the same reinterpretation, and the SPEC↔PLAN/BUILD divergence is hidden in prose rather than captured as an explicit erratum.

## Suggested direction

Primary: add a one-line "feasibility self-check" instruction to `src/defaults/prompts/spec.md` requiring the spec agent to walk each acceptance criterion against the implementation surface it just researched and either:

1. Reject any criterion whose precondition is structurally impossible (drop it from SPEC.md before the SPEC lands), or
2. Re-express the criterion in terms of the reachable precondition (e.g. for the parse-error case: "escalation slug is stable and idempotent on resume" instead of "collides with sibling entries").

Alternative (or complement): allow the `plan` step to emit a `SPEC-ERRATA.md` artifact when it discovers an unreachable AC, so the disagreement is captured in the artifact dir instead of buried in PLAN/BUILD/REVIEW prose. Pairs naturally with `refl-0028-plan-step-silently-dropped-spec-annotati` (SPEC→PLAN traceability) — both are about making SPEC↔downstream divergence loud.

## Acceptance hints

- `src/defaults/prompts/spec.md` gains an explicit feasibility-check step before emitting SPEC.md.
- After change: a future SPEC equivalent to cycle 0046's AC #6 ("collision suffix on escalation file") should either be rejected by the spec agent or re-expressed in reachable terms — not silently reinterpreted downstream.
- Run `npm run sync-defaults` after editing `src/defaults/prompts/spec.md` so the dogfooded engine picks it up.
- Out of scope: redesigning the spec→plan handoff or building a generalized erratum mechanism. Keep the change to the prompt edit unless the erratum path is genuinely cheaper.

## Origin

Reflection from cycle 0046 (`docs/cycle/0046-feature-harden-ingestreflection-parsing-fence-st/REFLECTION.md`). Priority hint 3.
