---
id: refl-0226-bootstraparchiveiflegacy-non-enoent-erro
title: Test and improve non-ENOENT error paths in bootstrapArchiveIfLegacy
workflow: feature
depends_on: []
triaged_at: "2026-05-21T13:54:11.279Z"
source: triage
---
## Problem

`bootstrapArchiveIfLegacy` in `src/engine/queue.ts` (lines 122, 132–133, 141–142) has non-ENOENT rethrow branches that are never exercised by tests. If a disk-full or permission error occurs during the legacy queue file rename at engine startup, these branches fire and surface as an opaque crash rather than a structured engine halt with a diagnostic message.

Current line coverage is 97.62% — the floor still passes, but the untested paths sit in the engine startup sequence where silent failure is highest-impact.

## Work

1. **Add test coverage.** In the queue test suite, add a case that stubs `fs.rename` (or the underlying rename call) to throw a non-ENOENT error (e.g. `EACCES` or `ENOSPC`). Assert that `bootstrapArchiveIfLegacy` propagates the error — i.e. the promise rejects with the original or wrapped error.

2. **Improve error message.** Wrap the rethrow at each non-ENOENT branch with a structured message:
   ```
   bootstrapArchiveIfLegacy: rename failed: ${err.message}
   ```
   This turns the opaque crash into a diagnosable engine startup failure.

## Acceptance criteria

- `npm run test:coverage` passes with the non-ENOENT branches now covered.
- `npm run check:coverage` passes — `src/engine/queue.ts` meets the 90% floor.
- `npm run typecheck` passes with no new errors.
- The rethrow at each non-ENOENT branch carries a context string (`bootstrapArchiveIfLegacy: rename failed: ...`).
