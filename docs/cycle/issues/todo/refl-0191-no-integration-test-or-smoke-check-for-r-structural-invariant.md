---
id: refl-0191-no-integration-test-or-smoke-check-for-r-structural-invariant
title: Add structural invariant asserting REFLECTION.md appears in documentation prompt inputs
workflow: feature
depends_on: []
triaged_at: "2026-05-20T02:15:43.548Z"
source: triage
parent: refl-0191-no-integration-test-or-smoke-check-for-r
---
## Problem

Cycles 0190 and 0191 added `REFLECTION.md` to the documentation prompt's `## Inputs to read` section. No automated gate would catch a future regression that accidentally removes this inclusion. The only verification today is that 531 unit tests still pass — none of which check prompt content.

## Goal

Add an entry to the `INVARIANTS` table in `scripts/structural-invariants.mjs` that asserts `REFLECTION.md` appears within the `## Inputs to read` section of `src/defaults/prompts/documentation.md`. This is a content-string check, not just file existence.

## Acceptance criteria

- `scripts/structural-invariants.mjs` has a new invariant that:
  - reads `src/defaults/prompts/documentation.md`
  - asserts the string `REFLECTION.md` appears within the `## Inputs to read` section (anchored to that section, not anywhere in the file)
- `npm run check:invariants` passes
- `npm test` passes with no regressions
- `npm run test:coverage` meets all per-file coverage floors

## Context

Build-time content checks are zero runtime cost and mechanically enforce the reflection→documentation data contract so regressions are caught immediately rather than silently.

Source: refl-0191 (origin_cycle_id: 0191), priority_hint: 6
