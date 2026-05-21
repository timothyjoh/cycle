---
id: refl-0211-review-md-artifact-contaminated-with-lea
title: REVIEW.md artifact contaminated with learning-mode narration and markdown fence wrapper
workflow: feature
depends_on: [refl-0209-spec-md-artifacts-contain-learning-mode]
triaged_at: "2026-05-21T07:55:22.177Z"
source: triage
---
## Problem

REVIEW.md artifacts written by the engine's documentation step are contaminated with learning-mode output. A representative example from cycle 0211 contains:

- A leading prose line: "All checks complete. Writing REVIEW.md to stdout now."
- An insight block (learning-mode formatting)
- The actual review content wrapped in a ` ``` `markdown code fence
- Trailing prose: "Written to stdout. No MUST-FIX.md created"

Only the inner review content is the legitimate artifact; everything else is agent narration that leaked into the file.

## Root Cause

Same root cause as `refl-0209-spec-md-artifacts-contain-learning-mode`: the agent invocation that writes REVIEW.md runs under the learning-mode output style, which injects prose narration and code fence wrappers around stdout content. The engine does not strip or validate REVIEW.md content after the documentation step writes it.

## Impact

- Review verdict line (`PASS`/`FAIL`) is buried inside a fence, breaking grep-based diagnostics
- Future tooling (issue extraction, automated review summarization) receives malformed content
- Inconsistent sanitization posture: triage artifacts are already stripped via `validateOutput`; REVIEW.md has no equivalent guard

## Fix Direction

Two viable approaches:

1. **Suppress at invocation time** (preferred): pass a flag or env var that disables learning-mode output style for all artifact-writing agent calls (spec step, documentation step). If the fix for `refl-0209-spec-md-artifacts-contain-learning-mode` implements a general suppression mechanism, REVIEW.md may be covered as a side effect — verify before writing a separate fix.

2. **Post-write strip**: after the documentation step writes REVIEW.md, apply `stripFences` + narration-line removal (same pattern as `validateOutput` in triage) to sanitize the file in place.

Option 1 is preferable — it prevents contamination at the source rather than patching after the fact.

## Implementation Steps

1. Confirm whether the fix landed for `refl-0209-spec-md-artifacts-contain-learning-mode` also covers the documentation step that writes REVIEW.md (same invocation path or separate).
2. If not covered: apply the same suppression or stripping logic to the documentation step.
3. Add a unit/integration test: mock documentation-step stdout containing learning-mode contamination and assert the written REVIEW.md contains only clean review content — no leading prose, no fence wrappers, no trailing narration.
4. Regression check: verify the review verdict line is greppable at the top level of the sanitized file.

## Acceptance Criteria

- [ ] REVIEW.md written by the documentation step contains no leading prose, insight blocks, or markdown fence wrappers
- [ ] The review verdict line (`PASS`/`FAIL`) is present and greppable at the top level of the file (not wrapped in a fence)
- [ ] No trailing narration lines appear after the review content
- [ ] Existing REVIEW.md-related tests pass without regression
- [ ] Fix approach is consistent with `refl-0209-spec-md-artifacts-contain-learning-mode` — no divergent sanitization patterns between spec and review artifact handling
