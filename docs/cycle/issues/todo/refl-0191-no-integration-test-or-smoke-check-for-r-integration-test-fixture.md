---
id: refl-0191-no-integration-test-or-smoke-check-for-r-integration-test-fixture
title: Add fixture test verifying documentation prompt incorporates REFLECTION.md content
workflow: feature
depends_on: [refl-0191-no-integration-test-or-smoke-check-for-r-structural-invariant]
triaged_at: "2026-05-20T02:15:43.548Z"
source: triage
parent: refl-0191-no-integration-test-or-smoke-check-for-r
---
## Problem

Even with the structural invariant confirming `REFLECTION.md` is listed as a documentation prompt input, no test verifies the documentation agent actually reads and incorporates its content. If the agent silently ignores the file (format mismatch, path resolution error, or any other reason), no gate catches it — the pipeline appears to work while delivering none of the intended benefit.

## Goal

Add a fixture-level test that validates the documentation prompt construction includes `REFLECTION.md` content when the file is present in the cycle directory.

## Acceptance criteria

- A new test in `tests/` (unit or integration) that:
  - Creates a synthetic cycle directory containing a known `REFLECTION.md` in the JSON format: `{"sharp_edges":[{"title":"...","body":"...","priority_hint":3}]}`
  - Exercises the documentation step's prompt-assembly path against this fixture
  - Asserts the assembled prompt text includes content from the synthetic `REFLECTION.md` (e.g. the `title` or `body` string appears in the prompt sent to the agent)
- Test is discoverable by `npm test` and included in coverage collection
- `npm run test:coverage` meets all per-file coverage floors with the new test included
- No regressions in existing 531 tests

## Notes

The practical scope is prompt-assembly verification, not a live LLM call. If the documentation step reads file contents and interpolates them into the prompt string, assert on the interpolated string. If it passes a file path list, assert the path appears and the file content is non-empty. Match the test approach to how `src/engine/` actually assembles the documentation prompt.

Source: refl-0191 (origin_cycle_id: 0191), priority_hint: 6
