---
id: refl-0226-bootstraparchiveiflegacy-non-enoent-erro
source: reflection
title: bootstrapArchiveIfLegacy non-ENOENT error paths untested and unhandled
added_at: "2026-05-21T13:51:32.736Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0226"
---

The REVIEW identified uncovered lines at `src/engine/queue.ts:122,132-133,141-142` — the non-ENOENT rethrow branches inside `bootstrapArchiveIfLegacy`. If a disk-full or permission error occurs while the engine tries to rename the legacy queue file at bootstrap, these branches fire but are never exercised by tests.

At 97.62% line coverage the floor still passes, but the untested paths are in the engine startup sequence. An unhandled rethrow here would surface as an opaque crash rather than a structured engine halt with a diagnostic message.

Suggested direction: Add a test case that stubs `rename` to throw a non-ENOENT error and assert `bootstrapArchiveIfLegacy` propagates it correctly. Consider wrapping the rethrow in a structured error with context (`bootstrapArchiveIfLegacy: rename failed: ${err.message}`).
