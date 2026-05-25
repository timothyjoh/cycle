---
id: refl-0209-refl-0208-trimtolastbalancedclose-todo-f
title: Engine commit step should archive untracked todo source-issue files instead of staging as new entries
workflow: feature
depends_on: []
triaged_at: "2026-05-21T07:17:39.785Z"
source: triage
---
## Problem

When a source-issue file lands in `todo/` as an untracked file (never committed to git), and the bug it tracks is fixed in the same cycle before that file was ever committed, the engine's commit step stages the file as a new `todo/` entry rather than archiving it to `done/`. The next triage pass then picks it up as unresolved open work despite the fix already existing in the same commit.

This occurred with `refl-0208-trimtolastbalancedclose-still-fails-for.md`: triaged to `todo/` during cycle 0209's session, but cycle 0209 fixed the described bug before that file was ever committed. Because the file was untracked at commit time, the issue-lifecycle archival logic — which deletes from `todo/` and writes to `done/` — had no prior committed state to act on. Manual intervention (moving the file to `done/` before commit) was required.

## Root Cause

The issue-lifecycle archival path only operates on files that have a prior committed state in `todo/`. An untracked `todo/` file has no committed state, so the engine treats it as a new open work item at staging time rather than as a resolved one needing archival.

## Fix

In the engine's commit step (`src/engine/commit-cycle.ts` or `src/engine/issue-lifecycle.ts`), add detection for this pattern:

1. Before staging files, enumerate untracked (`??` git status) files under `docs/cycle/issues/todo/`.
2. For each such file, check whether it is the `source_issue` of the current cycle spec (or otherwise corresponds to work resolved in this commit).
3. If the issue is resolved in this cycle, move the file to `docs/cycle/issues/done/` before staging — not as a new open `todo/` entry.

A minimal heuristic: any untracked `todo/` file whose id matches the current cycle's `source_issue` field should be archived rather than staged.

## Acceptance Criteria

- Untracked `todo/` files whose issues are fixed in the current commit are automatically moved to `done/` at commit time without manual intervention.
- Existing committed `todo/` files continue to be archived normally by the existing issue-lifecycle logic.
- No new committed `todo/` entries are created for issues already resolved within the same cycle.
- A test exercises the scenario: untracked todo file for source issue is present at commit time → file ends up in `done/`, not `todo/`, after commit step runs.
