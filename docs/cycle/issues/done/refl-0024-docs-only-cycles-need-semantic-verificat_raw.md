---
id: refl-0024-docs-only-cycles-need-semantic-verificat
source: reflection
title: docs-only-cycles-need-semantic-verification-step
added_at: "2026-05-13T20:02:55.660Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0024"
---

Cycle 0024's PLAN §Verification only specified grep-for-field-names and slug-resolution checks. Both passed, but the README still documented a recovery flow that fails on first command because the structural checks never cross-referenced the doc against `src/engine/triage.ts`. REVIEW.md adversarial section called this out: "editorial verification was the test surface for this cycle, and it failed." The doc-vs-code drift required a full NEEDS-FIX round.

For docs-only cycles that describe runtime behavior (recovery flows, command outputs, log payloads), the verification phase should include a "replay the doc against current code" pass — either by tracing each documented command/path back to its implementation, or by adding a checklist of "does this prose match the symbol it names?" prompts. Pure grep/anchor checks catch structural problems but cannot catch fiction.

Suggested direction: add a verification clause to the `feature` workflow's docs-track prompts (or a new `docs` workflow variant) that requires the build-step agent to enumerate every command, path, and behavioral claim in the new prose and pair it with a file:line reference proving the claim holds at HEAD. The grep checks stay; this adds the semantic layer.
