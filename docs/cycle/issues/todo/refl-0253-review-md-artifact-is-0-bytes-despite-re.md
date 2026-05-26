---
id: refl-0253-review-md-artifact-is-0-bytes-despite-re
title: Add empty-artifact guard for REVIEW.md after review step (analogous to MUST-FIX.md gate)
workflow: feature
depends_on: []
triaged_at: "2026-05-26T04:06:07.057Z"
source: triage
priority: medium
---
## Problem

The review step for cycle 0253 exited 0 but `REVIEW.md` was 0 bytes. Downstream steps (verify, reflection) consumed an empty artifact with no failure signal — the cycle produced no review record while appearing to succeed.

## Investigation

Before implementing the guard, confirm how `REVIEW.md` is written:

- Does the engine create the file before the step runs and populate it from stdout capture on exit?
- Or does the step agent write it directly?

A partial-output or silent-drop scenario could zero the file even on a clean exit code.

## Fix

Add a post-step size guard for `REVIEW.md` modeled on the existing `MUST-FIX.md` gate used after the fix step:

1. After the review step exits 0, stat `REVIEW.md`.
2. If the file is missing or 0 bytes, fail the step with a descriptive error message (e.g. `"review step exited 0 but REVIEW.md is empty — treating as failure"`).
3. Do not let verify or reflection run against an empty review artifact.

## Acceptance criteria

- `npm test` passes, coverage does not decrease.
- A test covers the empty-artifact guard: review step returns exit 0, `REVIEW.md` is empty → step is marked failed with the expected error message.
- Existing passing-review path (non-empty `REVIEW.md`, exit 0) is unaffected.
