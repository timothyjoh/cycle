---
id: refl-0241-add-unit-test-for-quoted-path-untracked
source: reflection
title: Add unit test for quoted-path untracked files in parseSnapshotPaths
added_at: "2026-05-21T21:30:33.367Z"
triage_attempts: 0
priority: low
origin_cycle_id: "0241"
---

The `??` branch in `parseSnapshotPaths` (`src/engine/run-cycle.ts:46`) applies quote-stripping via `replace(/^"/,"").replace(/"$/,"")` before prefix-filtering, but no unit test exercises a quoted untracked path such as `?? "src/file with spaces.ts"`. The code path is correct — the implementation was reviewed and approved — but the quote-strip logic is untested.

Add one or two cases to `tests/engine/run-cycle.parse-snapshot.test.ts` covering a quoted `??` path under `src/` (should be included, quotes stripped) and optionally a quoted `??` path outside `src/`/`scripts/` (should be excluded). This keeps the unit test file exhaustive without touching any production code.
