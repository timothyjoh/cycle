---
id: refl-0187-build-step-omits-test-file-changes-from
title: Auto-populate BUILD.md Touched Files from git diff at build-step completion
workflow: feature
depends_on: []
triaged_at: "2026-05-19T17:40:27.516Z"
source: triage
---
## Problem

In cycle 0187, `tests/defaults/feature-loadable.test.ts` was modified by the build step but was not listed in BUILD.md Touched Files. This caused a scopeGuard commit block, forcing a full-cost retry cycle.

This is a systematic reliability gap: BUILD.md Touched Files is manually maintained by the agent, and test file changes are consistently missed. Every miss produces a scopeGuard failure and a retry at full cycle cost.

## Root Cause

The build step instructs the agent to enumerate modified files in BUILD.md Touched Files manually. Agents reliably omit test files that are modified as side effects of implementation changes — these are easy to overlook when listing files by memory rather than by inspection.

## Fix

At build-step completion, auto-populate BUILD.md Touched Files from `git diff --name-only` relative to the cycle base commit, replacing or supplementing manual enumeration.

The engine (or a post-build hook in the workflow) should:
1. Run `git diff --name-only <base_commit>` after the build step exits
2. Merge the resulting file list into the "Touched Files" section of BUILD.md
3. Deduplicate and sort entries

The base commit is the HEAD at cycle start, already available in the engine as the pre-cycle snapshot used by scopeGuard itself.

## Acceptance Criteria

- BUILD.md Touched Files section is auto-populated from `git diff --name-only` at build-step completion
- Test files modified as build side effects are included automatically without agent intervention
- Manual agent enumeration is either replaced or supplemented by the auto-population
- scopeGuard commit blocks no longer occur due to missed test file changes in BUILD.md

## Related

- `refl-0187-scopeguard-blocks-documentation-step-fil` — parallel gap: documentation-step output paths also missing from BUILD.md Touched Files
- `refl-0187-scopeguard-does-not-skip-deleted-files-f` — separate scope-guard issue: deleted files should be skipped by the guard
