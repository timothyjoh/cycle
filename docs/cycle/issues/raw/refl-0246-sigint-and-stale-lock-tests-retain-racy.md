---
id: refl-0246-sigint-and-stale-lock-tests-retain-racy
source: reflection
title: SIGINT and stale-lock tests retain racy bare readFile assertion pattern
added_at: "2026-05-21T23:46:36.853Z"
triage_attempts: 0
priority: low
origin_cycle_id: "0246"
---

REVIEW.md finding 2 notes that the SIGINT test (lines 216–222) and stale-lock test (lines 99–105) in `tests/cli/engine-lock-integration.test.ts` still use the old bare `try { await readFile(lockPath) } catch { lockExists = false }` pattern that cycle 0246 fixed for the SIGTERM test.

These paths have not been reported flaky yet, but they share the same structural race: the parent asserts lock absence immediately after a process-exit event fires, before the async `unlink` may have propagated to the filesystem. Under load or slow CI they can fail non-deterministically.

Suggested fix: apply `waitForAbsence(lockPath)` to both remaining sites, following the same pattern established in cycle 0246. No design decision required — the helper already exists in the same file.
