---
id: refl-0042-drop-missing-value-test-assertion-is-tau
title: Tighten `--priority` missing-value test assertion in parse-args.test.ts
workflow: quickfix
depends_on: []
triaged_at: "2026-05-14T05:12:22.566Z"
source: triage
---
## Context

From REVIEW.md §Adversarial Test Review (cycle 0042) — finding 1: the assertion at `tests/cli/parse-args.test.ts:89` for the `--priority` (no value) rejection branch only matches `/drop:/`. That regex matches **any** error wrapped with the `drop:` prefix — including the unrelated `drop requires task text` path. The test passes even if the missing-value branch silently regresses to a different error message, so the assertion is tautological for its stated purpose.

FIX.md was a no-op because REVIEW.md verdict was PASS and no MUST-FIX.md was emitted — the finding survived into reflection.

## Goal

Pin the assertion to the actual missing-value error path so a regression in that branch (e.g. swap to a different node:util message, accidental fall-through to the `requires task text` path) fails the test.

## Acceptance

- `tests/cli/parse-args.test.ts:89` (the `--priority` no-value rejection case) asserts against a regex that uniquely identifies the missing-value branch:
  - either the wrapped node:util message (e.g. `/Option '--priority'.*(missing|requires).*argument/i`)
  - or the `usage: cycle drop` line if the CLI re-wraps with usage on this branch.
- Verify by inspection of `src/cli/parse-args.ts` (or wherever `--priority` parsing lives) which exact string is produced on missing value; assert against that, not against the generic `drop:` prefix.
- Add a sibling negative-control assertion (or comment) confirming the regex does NOT match the `drop requires task text` error, so the two branches are distinguishable.
- `npm test` green; coverage baselines hold (line ≥ 95%, branch ≥ 75%, function ≥ 90%).

## Scope

- One-line (or near one-line) change in `tests/cli/parse-args.test.ts`.
- No production-code change expected. If the underlying error message is itself ambiguous (e.g. both branches share a string), the cycle may extend to disambiguating the thrown message in `parse-args.ts` — call that out in SPEC.md if so.

## Out of scope

- Refactoring the broader `parse-args` error-wrapping convention.
- Touching other `--priority` tests beyond the missing-value branch.

## Source

Reflection from cycle 0042 (REVIEW.md §Adversarial Test Review, finding 1). priority_hint: 3.
