---
id: refl-0050-spec-language-same-order-of-checks-is-am
source: reflection
title: spec-language-same-order-of-checks-is-ambiguous-on-multi-violation-precedence
added_at: "2026-05-14T18:16:49.882Z"
triage_attempts: 1
priority_hint: 3
origin_cycle_id: "0050"
---

Cycle 0050 SPEC §Requirements said the refactored validator should reject "the same inputs it rejected before, in the same order of checks." The PLAN §Risk Assessment flagged the cross-child shape-error reorder variant but missed a second reorder: the inline duplicate-id check (`triage.ts:470-475`) now fires mid-loop and can beat the `decomposed_parents` membership check (`triage.ts:478-484`) on multi-violation inputs where pre-refactor the standalone duplicate pass ran AFTER `decomposed_parents`. REVIEW.md Finding 1 (Code Quality) caught it. No test pins cross-violation precedence (every `checkReject` call uses a single-violation fixture) and the only production caller feeds the reason back as retry text, so impact is zero today — but the SPEC's loose language let a precedence shift slip past PLAN's risk enumeration.

The sharp edge is SPEC discipline, not the refactor: "same order of checks" is under-specified for validators with N independent reject paths. A future refactor could silently change precedence on a path that a downstream consumer (retry-prompt template, fuzzer, telemetry classifier) does care about.

Suggested direction: update the SPEC template or RFC-001 with a small checklist for validator/parser refactors — either (a) enumerate the pre-refactor check order and require post-refactor parity, or (b) add an explicit "precedence-may-change" carve-out. Pairs naturally with `refl-0046-spec-ac-6-was-structurally-unreachable-f-spec-feasibility-self-check` (also a SPEC-discipline reflection).
