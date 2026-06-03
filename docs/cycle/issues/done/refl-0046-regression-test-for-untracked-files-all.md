---
id: refl-0046-regression-test-for-untracked-files-all
title: Add regression test for --untracked-files=all doc-deliverable subtree detection
workflow: feature
depends_on: []
triaged_at: 2026-06-03T17:59:12.631Z
source: triage
priority: medium
---
## Context

Cycle 0046's PLAN→BUILD deviation added `--untracked-files=all` to the doc-deliverable scan in `src/engine/run-cycle.ts` (the `expects_code: false` opt-out path). Without the flag, a freshly-created untracked `docs/` subtree collapses to a single `?? docs/` porcelain entry; `parseDocDeliverablePaths` would then wrongly treat that bare directory entry as an in-scope deliverable and relax the no-deliverable guard. The flag forces per-file listing so the scan sees the real paths.

The regression is currently undetected: every existing case in `tests/engine/empty-diff-guard.test.ts` places the deliverable at a top-level `docs/RFC-x.md`, which lists identically with or without the flag. Removing `--untracked-files=all` would still pass the suite while silently reintroducing the bug.

## Deliverable

Add one integration case in `tests/engine/empty-diff-guard.test.ts` that:

- Sets `expects_code: false` on the source issue.
- Produces an **empty `src scripts tests` diff**.
- Places the **only** doc deliverable in a brand-new, fully untracked subdirectory (e.g. `docs/adr/0001.md`) — so that without `--untracked-files=all` the scan would only see `?? docs/`.
- Asserts the cycle still completes `ok` (docs committed via the normal `commitCycle` path; not a `cycle.noop`).

This discriminating guard locks the deviation rationale: it must fail if `--untracked-files=all` is removed from the doc-deliverable scan.

## Notes

Mechanical to construct against the existing fake-`claude` harness used by the other cases in this file. Mirror an existing passing `expects_code: false` doc-deliverable case and change only the deliverable path to a new untracked subtree. No production code change is expected — this is a test-only addition.
