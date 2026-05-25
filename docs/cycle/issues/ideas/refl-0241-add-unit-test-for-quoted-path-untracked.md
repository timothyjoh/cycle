---
id: refl-0241-add-unit-test-for-quoted-path-untracked
title: Add unit test for quoted-path untracked files in parseSnapshotPaths
workflow: feature
depends_on: []
triaged_at: "2026-05-21T21:32:45.259Z"
source: triage
priority: low
---
## Problem

The `??` branch in `parseSnapshotPaths` (`src/engine/run-cycle.ts:46`) strips surrounding quotes from filenames before prefix-filtering:

```ts
path.replace(/^"/,"").replace(/"$/,"")
```

This handles git's quoting of paths containing spaces (e.g. `?? "src/file with spaces.ts"`), but no unit test exercises this code path. The implementation was reviewed and approved in cycle 0241; only test coverage is missing.

## Acceptance Criteria

- Add one or two test cases to `tests/engine/run-cycle.parse-snapshot.test.ts` for quoted `??` paths:
  1. Quoted `??` path under `src/` — should be included with quotes stripped (e.g. input `?? "src/file with spaces.ts"` → output includes `src/file with spaces.ts`).
  2. *(Optional)* Quoted `??` path outside `src/`/`scripts/` — should be excluded.
- No production code changes.
- All existing tests continue to pass.
- Per-file coverage floor for `src/engine/run-cycle.ts` (90%) maintained.

## Location

- Test file: `tests/engine/run-cycle.parse-snapshot.test.ts`
- Source under test: `src/engine/run-cycle.ts` — `parseSnapshotPaths` function, the `??` branch (~line 46).
