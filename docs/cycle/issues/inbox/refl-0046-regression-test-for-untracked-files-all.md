---
id: refl-0046-regression-test-for-untracked-files-all
source: reflection
title: regression test for untracked-files=all doc-deliverable subtree detection
added_at: 2026-06-03T17:54:35.193Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0046"
---

The PLAN→BUILD deviation added `--untracked-files=all` to the doc-deliverable scan in `src/engine/run-cycle.ts` so a freshly-created untracked `docs/` subtree lists per-file instead of collapsing to a single `?? docs/` entry — which `parseDocDeliverablePaths` would wrongly treat as an in-scope deliverable and relax the no-deliverable case. No integration test isolates this: every current case places the deliverable at a top-level `docs/RFC-x.md`, so removing the flag would still pass the suite while silently reintroducing the bug.

Add one integration case in `tests/engine/empty-diff-guard.test.ts` that puts the only deliverable in a brand-new untracked subdirectory (e.g. `docs/adr/0001.md`) with an empty `src scripts tests` diff, asserting the cycle still completes `ok`. This locks the deviation rationale to a discriminating regression guard. Mechanical to construct against the existing fake-`claude` harness, but requires understanding the flag's purpose, so it is a future-cycle defer rather than a context-free fix.
