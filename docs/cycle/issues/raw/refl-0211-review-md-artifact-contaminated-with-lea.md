---
id: refl-0211-review-md-artifact-contaminated-with-lea
source: reflection
title: REVIEW.md artifact contaminated with learning-mode narration and markdown fence wrapper
added_at: "2026-05-21T07:45:44.222Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0211"
---

The REVIEW.md for cycle 0211 at docs/cycle/0211-.../REVIEW.md contains learning-mode output: a leading prose line ("All checks complete. Writing REVIEW.md to stdout now."), an insight block, the actual review content wrapped in a ```markdown code fence, and trailing prose ("Written to stdout. No MUST-FIX.md created").

Root cause is the same as refl-0209-spec-md-artifacts-contain-learning-mode (already filed for SPEC artifacts). REVIEW.md is a distinct artifact type: while the engine currently makes no programmatic decisions from REVIEW.md, future tooling (e.g. issue extraction, automated review summarization) would need clean content. The fenced wrapper also makes the verdict line harder to grep for in ad-hoc diagnostics.

Fix direction: same as the existing spec-md issue — suppress learning-mode output style for all artifact-writing agent invocations, or strip fences from artifact files as a post-write step.
