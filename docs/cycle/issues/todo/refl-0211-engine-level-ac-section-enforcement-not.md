---
id: refl-0211-engine-level-ac-section-enforcement-not
title: Engine-level AC section enforcement not yet implemented — prompt-only guard is insufficient
workflow: feature
depends_on: []
triaged_at: "2026-05-21T07:51:56.985Z"
source: triage
---
## Problem

Cycle 0211 added prose to `spec.md` instructing the spec agent to include `## Acceptance Criteria`. This guard is prompt-level only. A spec agent that ignores the instruction produces an AC-free `SPEC.md` and the engine accepts it — reproducing the original failure mode surfaced in refl-0205.

## Root Cause

No post-condition check exists on the spec step. The engine reads `SPEC.md` after spec agent exit but does not validate its structure. Structural validation only exists on the build step (src/ changes check). Cycle 0211 SPEC explicitly deferred this engine-level enforcement as a follow-on cycle.

## Fix Direction

Add a spec-step post-condition in the engine that:
1. Reads the generated `SPEC.md`
2. Checks for presence of `## Acceptance Criteria` heading
3. Checks that at least one checkbox-format bullet (`- [ ]`) appears under that heading
4. Fails with a descriptive error if either check fails, triggering the normal post-condition failure path

This is analogous to the existing build step post-condition in `src/engine/run-cycle.ts` that checks for `src/` changes.

## Implementation Steps

1. Locate the spec step execution and its post-condition hook in `src/engine/run-cycle.ts` (or equivalent)
2. After spec agent exits with code 0, read `SPEC.md` from the cycle workspace
3. Parse for `## Acceptance Criteria` heading (case-insensitive match acceptable)
4. Assert at least one `- [ ]` bullet follows the heading before the next `##` section
5. On failure: emit a descriptive engine event and return a post-condition failure (same path as build step)
6. Add unit/integration tests covering: AC present with bullets (pass), AC absent (fail), AC heading present but no bullets (fail)

## Acceptance Criteria

- [ ] Engine rejects a SPEC.md with no `## Acceptance Criteria` heading with a descriptive error
- [ ] Engine rejects a SPEC.md with `## Acceptance Criteria` heading but no `- [ ]` bullets with a descriptive error
- [ ] Engine accepts a SPEC.md with `## Acceptance Criteria` and at least one `- [ ]` bullet
- [ ] Post-condition failure triggers the same failure path as other post-condition failures (no silent acceptance)
- [ ] Tests cover all three cases above with coverage gates met
- [ ] No regression in existing post-condition tests
