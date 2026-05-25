---
id: mentor-readme-cleanup-undocumented
title: "README.md missing cycle cleanup command — documented in CLAUDE.md but invisible to users"
added_at: "2026-05-25T00:00:00.000Z"
source: mentor-review
triage_attempts: 0
priority_hint: 5
---

## Problem

`cycle cleanup` is a real, useful command (`src/cli/cleanup.ts`) that lists or deletes local `cycle/*` branches with no matching `in_progress` queue row. It is documented in `CLAUDE.md` but does not appear anywhere in `README.md`.

Users onboarding from the README have no way to discover this command. As cycle accumulates branches in a long-running repo, orphaned branches pile up invisibly.

## Fix

Add `cycle cleanup` to the "Quick start" or a "Maintenance" section of `README.md` with a one-line description and the key flags (`--dry-run`, `--yes`, `--force`).

Suggested placement: after the `cycle status` and `cycle triage --dry-run` entries in the quick-start command table.

## Acceptance Criteria

- [ ] `README.md` documents `cycle cleanup` with its flags and purpose
- [ ] The description matches the actual behavior in `src/cli/cleanup.ts`
- [ ] No source code changes (documentation only)
- [ ] All existing tests pass
