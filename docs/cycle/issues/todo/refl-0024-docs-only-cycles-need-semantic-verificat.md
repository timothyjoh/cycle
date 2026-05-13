---
id: refl-0024-docs-only-cycles-need-semantic-verificat
title: Add semantic doc-vs-code verification step for docs-only cycles
workflow: feature
depends_on: []
triaged_at: "2026-05-13T20:03:57.098Z"
source: triage
---
## Context

Surfaced by reflection on cycle 0024 (origin_cycle_id `0024`, priority_hint 5).

Cycle 0024's PLAN §Verification only specified grep-for-field-names and slug-resolution checks. Both passed, but the README still documented a recovery flow that fails on first command because the structural checks never cross-referenced the doc against `src/engine/triage.ts`. REVIEW.md's adversarial section called this out: "editorial verification was the test surface for this cycle, and it failed." The doc-vs-code drift required a full NEEDS-FIX round.

## Problem

For docs-only cycles that describe runtime behavior (recovery flows, command outputs, log payloads), purely structural verification (grep for field names, slug-resolution, anchor existence) catches structural problems but cannot catch fiction. A README section can pass every grep-based check while still documenting commands or paths that do not exist or behave differently in the code at HEAD.

## Direction

Add a verification clause to the `feature` workflow's docs-track prompts (or a new `docs` workflow variant) that requires the build-step / verification agent to:

1. Enumerate every command, path, file reference, and behavioral claim introduced or modified in the new prose.
2. Pair each enumerated item with a `file:line` reference proving the claim holds at HEAD (e.g. the documented command's flag is parsed in `src/cli/parse-args.ts:NN`, the emitted event field is set in `src/engine/<x>.ts:NN`).
3. Fail verification if any enumerated claim cannot be paired with a HEAD reference, or if a paired reference contradicts the claim.

The existing grep / anchor / slug-resolution checks stay; this adds a semantic layer specifically for runtime-behavior prose.

## Scope sketch

- Decide: extend `feature` workflow's verification prompt, or introduce a `docs` workflow variant (the existing `txt-20260513-185312-add-documentation-workflow-step-prompt-n` row is related and may host this).
- Update the relevant verification prompt under `src/defaults/` (and run `npm run sync-defaults`).
- Define the failure mode: verification step exits non-zero with a structured list of unbacked claims, so the fix step has actionable input.

## Out of scope

- Static doc-linking infrastructure (e.g. auto-generated reference checks). This raw is about a prompt-level pass, not new tooling.

## Related

- `txt-20260513-185312-add-documentation-workflow-step-prompt-n` — post-reflection documentation workflow step; this verification clause likely lives there if a dedicated `docs` workflow is chosen.
- Cycle 0024 REVIEW.md adversarial section (editorial verification gap).
