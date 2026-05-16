---
id: refl-0080-claude-md-missing-empty-diff-post-condit
title: Add empty-diff post-condition guard architecture bullet to CLAUDE.md
workflow: feature
depends_on: []
triaged_at: "2026-05-16T00:05:31.365Z"
source: triage
failed_at: "2026-05-16T18:04:21.733Z"
failed_step: spec
failed_attempts: 3
last_cycle_id: "0105"
---
## Problem

`grep 'Empty-diff' CLAUDE.md` returns nothing. The architecture quick reference documents the `spec` post-condition guard but has no corresponding bullet for the `build`/`fix` empty-diff post-condition guard that landed in cycle 0080.

## What to do

Insert a new architecture bullet for the empty-diff guard in `CLAUDE.md` immediately after the existing `- Spec post-condition:` bullet. The exact text to insert is recorded in `docs/cycle/0080-feature-add-empty-diff-post-condition-guard-to-b/FIX.md` Task 3.

## Acceptance criteria

- `grep -i 'empty.diff\|empty-diff' CLAUDE.md` returns a match in the architecture quick reference section.
- The new bullet appears directly after the `- Spec post-condition:` entry.
- No source code is modified — this is a documentation-only change.
- `npm test` passes with no regressions.
