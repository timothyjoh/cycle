---
id: mentor-status-discuss-count
title: "cycle status omits discuss/ count — parked issues are invisible to operators"
added_at: "2026-05-25T00:00:00.000Z"
source: mentor-review
triage_attempts: 0
priority_hint: 6
---

## Problem

`src/cli/status.ts` counts five issue folders: `raw`, `todo`, `done`, `failed`, `blocked`. It does not count `docs/cycle/issues/discuss/`.

Issues parked via `priority: discuss` are moved to `discuss/` by the triage loop and become invisible to `cycle status`. A repo with 20 parked discuss items appears to have an empty inbox. Operators forget these items exist, defeating the purpose of the discuss lane.

## Fix

Add `discuss` to the `ISSUE_FOLDERS` constant and the output in `src/cli/status.ts`:

```typescript
export const ISSUE_FOLDERS = ["raw", "todo", "done", "failed", "blocked", "discuss"] as const;
```

Output line: `discuss: N`

Position it after `blocked` in the output so the full folder set is visible.

## Acceptance Criteria

- [ ] `cycle status` output includes a `discuss: N` line
- [ ] Count is accurate when `docs/cycle/issues/discuss/` contains `.md` files
- [ ] Count is `0` (not an error) when the `discuss/` directory does not exist
- [ ] `ISSUE_FOLDERS` type and any consumers that iterate it handle the new value correctly
- [ ] Unit test for `runStatus` covers the `discuss` count
- [ ] All existing tests pass
