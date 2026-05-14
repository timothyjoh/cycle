---
id: refl-0050-spec-language-same-order-of-checks-is-am
title: Add validator/parser refactor precedence checklist to SPEC template (or RFC-001)
workflow: feature
depends_on: []
triaged_at: "2026-05-14T18:19:50.923Z"
source: triage
---
## Context

Cycle 0050 SPEC §Requirements said the refactored triage validator should reject "the same inputs it rejected before, in the same order of checks." PLAN §Risk Assessment flagged the cross-child shape-error reorder variant but missed a second reorder: the inline duplicate-id check (`src/engine/triage.ts:470-475`) now fires mid-loop and can beat the `decomposed_parents` membership check (`src/engine/triage.ts:478-484`) on multi-violation inputs where pre-refactor the standalone duplicate pass ran AFTER `decomposed_parents`. REVIEW.md Finding 1 (Code Quality) caught it post-hoc.

Impact today is zero — the only production caller feeds reject reasons back as retry text, no test or telemetry classifier depends on cross-violation precedence. But the SPEC's loose phrasing let a precedence shift through PLAN's risk enumeration without detection. The next refactor of a validator/parser with N independent reject paths could silently change precedence on a path a downstream consumer (retry-prompt template, fuzzer, telemetry classifier, structured error matcher) does care about.

## Goal

Make SPEC discipline force authors to explicitly handle reject-path precedence whenever they refactor a validator/parser. Eliminate the ambiguous "same order of checks" phrasing.

## Proposed direction

Add a small checklist to the SPEC template (`src/defaults/prompts/spec.md`) — or to RFC-001 (`docs/RFC-001-issue-lifecycle.md`) if it's a cross-cutting authoring rule — that triggers when the work touches a validator, parser, or any function with N independent reject/error paths. Two acceptable resolutions per refactor:

1. **Parity mode** — enumerate the pre-refactor check order in the SPEC, require post-refactor parity, and add at least one multi-violation fixture pinning the order.
2. **Carve-out mode** — declare "precedence-may-change" explicitly in the SPEC, list every consumer that does NOT depend on precedence (with evidence: grep for callers, search log shapes, etc.), and accept the reorder.

Writer picks whichever fits — but the SPEC must show one of the two was chosen, not silently default to "same order" with no enforcement.

## Acceptance

- SPEC template / RFC-001 carries a named subsection (e.g. "Validator and parser refactor precedence") with the two modes documented.
- A test or lint-style check (could be as light as a phrase grep in the spec.md prompt's feasibility self-check) catches a SPEC that says "same order of checks" without enumerating which checks or declaring carve-out.
- Existing pending raw `refl-0046-spec-ac-6-was-structurally-unreachable-f-spec-feasibility-self-check` is the natural carrier for the lint side of this — coordinate the two SPECs so the feasibility self-check pass covers both "structurally unreachable AC" and "unenforced precedence claim." If 0046 lands first, this cycle extends its self-check; if this lands first, 0046 picks up the precedence rule too.

## Pairings

- `refl-0046-spec-ac-6-was-structurally-unreachable-f-spec-feasibility-self-check` — same SPEC-discipline theme (spec.md prompt hardening). Land together if scheduling allows.

## Out of scope

- Retroactively re-pinning precedence for the cycle 0050 refactor. Impact is zero today; this work is forward-looking.
- Adding precedence telemetry to triage.ts itself.
